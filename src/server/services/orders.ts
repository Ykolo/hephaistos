import { randomBytes } from "node:crypto";
import type { Tx } from "../db";
import { ActionError } from "../errors";
import {
  computeTotals,
  type PricingDiscount,
  type PricingShipping,
  type Totals,
} from "./pricing";
import type { Address } from "@/lib/validation/address";

/**
 * Commandes — modèle et création (HEP-52).
 *
 * La règle qui gouverne tout ce fichier : **une commande est un instantané**.
 * Changer un prix, renommer un produit ou l'archiver demain ne doit modifier
 * aucune commande passée. Rien n'est donc lu par relation au moment de
 * l'affichage : le nom, le SKU et le prix sont *recopiés* sur la ligne, et les
 * adresses dans la commande.
 *
 * Service pur au sens de `README.md` : il reçoit la transaction, jamais les
 * cookies.
 */

/**
 * Longueur du jeton de suivi, en octets.
 *
 * 32 octets = 256 bits, soit le même ordre de grandeur qu'une clé de session.
 * Ce jeton donne accès à une adresse postale et à un montant sans aucune
 * authentification : il doit être hors de portée d'une énumération.
 */
const PUBLIC_TOKEN_BYTES = 32;

export type CreateOrderInput = {
  /** Panier serveur d'origine (HEP-46). Ses lignes sont figées ici. */
  cartToken: string;
  email: string;
  shippingAddress: Address;
  /** Absente = identique à l'adresse de livraison, cas de très loin le plus fréquent. */
  billingAddress?: Address;
  /** Mode de livraison retenu dans le tunnel. Absent = retrait à définir (HEP-70). */
  shipping?: PricingShipping | null;
  /** Remise **déjà validée** par le moteur de codes promo (HEP-75). */
  discount?: PricingDiscount | null;
  /**
   * Clé d'idempotence produite au rendu du panier (HEP-54).
   *
   * Son unicité en base est ce qui empêche le double clic sur « payer » de
   * créer deux commandes : la seconde insertion viole la contrainte.
   */
  idempotencyKey?: string;
  /** Compte client, quand il y en a un (HEP-62). */
  userId?: string;
  vatRateBps?: number;
};

/** Ligne de commande figée. */
type OrderItemSnapshot = {
  productId: string;
  nameSnapshot: string;
  skuSnapshot: string;
  priceCentsSnapshot: number;
  qty: number;
};

/**
 * Tire le prochain numéro de commande de l'année.
 *
 * `next_order_number()` vit en base et non ici : deux commandes passées dans
 * la même milliseconde doivent être sérialisées par Postgres. Un `SELECT MAX`
 * suivi d'un `+1` en JavaScript leur donnerait le même numéro — c'est
 * précisément le scénario de la definition of done.
 */
async function nextOrderNumber(tx: Tx, year: number): Promise<string> {
  const rows = await tx.$queryRaw<
    { next_order_number: string }[]
  >`SELECT next_order_number(${year}::int)`;

  const number = rows[0]?.next_order_number;
  if (!number) {
    throw new Error("next_order_number n'a rien renvoyé — migration manquante ?");
  }
  return number;
}

/**
 * Jeton de suivi, aléatoire et non énumérable.
 *
 * À ne jamais dériver du numéro de commande : `HF-2026-0042` est lisible au
 * téléphone, donc devinable. Si le suivi acceptait le numéro, n'importe qui
 * parcourrait toutes les commandes de la boutique, adresses comprises.
 */
function publicToken(): string {
  return randomBytes(PUBLIC_TOKEN_BYTES).toString("base64url");
}

/**
 * Crée une commande à partir du panier, en figeant tout ce qui peut bouger.
 *
 * La commande naît `PENDING` : elle existe **avant** le paiement, parce que
 * Stripe a besoin d'une référence à rattacher à sa session (HEP-58) et que le
 * webhook doit retrouver quelque chose à confirmer (HEP-59). Le stock n'est
 * pas décrémenté ici — il l'est à l'encaissement, et lui seul fait foi.
 *
 * Un panier abandonné à ce stade laisse un numéro inutilisé dans la série.
 * C'est sans conséquence pour une commande, contrairement à une facture.
 *
 * ⚠️ **À appeler dans un `$transaction`.** Passer `db` directement fait tirer
 * le numéro dans sa propre transaction : si la création échoue ensuite, le
 * numéro est perdu au lieu d'être rendu.
 */
export async function createOrder(
  tx: Tx,
  input: CreateOrderInput,
): Promise<{ id: string; number: string; publicToken: string; totals: Totals }> {
  const cart = await tx.cart.findUnique({
    where: { token: input.cartToken },
    select: {
      id: true,
      items: {
        orderBy: { id: "asc" },
        select: {
          qty: true,
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              priceCents: true,
              availability: true,
              preorderShipsAt: true,
            },
          },
        },
      },
    },
  });

  if (!cart || cart.items.length === 0) {
    throw new ActionError("NOT_FOUND", "Votre panier est vide.");
  }

  // Les montants passent par le moteur de prix (HEP-47), jamais par une
  // addition écrite ici : le total de la commande doit être au centime celui
  // que le client a vu dans son panier.
  const totals = computeTotals({
    lines: cart.items.map((item) => ({
      productId: item.product.id,
      qty: item.qty,
      unitPriceCents: item.product.priceCents,
    })),
    discount: input.discount ?? null,
    shipping: input.shipping ?? null,
    vatRateBps: input.vatRateBps,
  });

  const items: OrderItemSnapshot[] = cart.items.map((item) => ({
    productId: item.product.id,
    // Les trois recopies qui font tout l'intérêt du modèle. `product.name` lu
    // par relation à l'affichage montrerait le nom d'aujourd'hui sur une
    // commande d'il y a six mois.
    nameSnapshot: item.product.name,
    skuSnapshot: item.product.sku,
    priceCentsSnapshot: item.product.priceCents,
    qty: item.qty,
  }));

  const preorders = cart.items.filter((i) => i.product.availability === "PREORDER");
  // Une seule date pour la commande : la plus lointaine. Expédier en deux fois
  // est une décision ouverte (HEP-51) ; tant qu'elle n'est pas tranchée, un
  // colis part quand tout est prêt, et c'est cette date-là qu'on annonce.
  const preorderShipsAt = preorders.reduce<Date | null>((latest, item) => {
    const date = item.product.preorderShipsAt;
    if (!date) return latest;
    return latest === null || date > latest ? date : latest;
  }, null);

  const order = await tx.order.create({
    data: {
      number: await nextOrderNumber(tx, new Date().getFullYear()),
      publicToken: publicToken(),
      email: input.email,
      userId: input.userId ?? null,
      status: "PENDING",

      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountCents,
      shippingCents: totals.shippingCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      vatRate: totals.vatRateBps,
      discountCode: totals.discountCode,

      // Copiées, pas référencées : voir `src/lib/validation/address.ts`.
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingAddress ?? input.shippingAddress,

      idempotencyKey: input.idempotencyKey ?? null,

      isPreorder: preorders.length > 0,
      preorderShipsAt,

      items: { create: items },
    },
    select: { id: true, number: true, publicToken: true },
  });

  return { ...order, totals };
}

/**
 * Retrouve une commande par son jeton de suivi.
 *
 * **Seule** entrée publique vers une commande. Il n'existe volontairement pas
 * d'équivalent par numéro : ce serait rouvrir l'énumération que `publicToken`
 * existe pour fermer.
 */
export async function findOrderByPublicToken(tx: Tx, token: string) {
  // Un jeton vide viendrait d'une URL tronquée. Sans cette garde, la requête
  // partirait quand même et un jour une donnée vide en base y répondrait.
  if (!token) return null;

  return tx.order.findUnique({
    where: { publicToken: token },
    select: {
      number: true,
      status: true,
      createdAt: true,
      paidAt: true,
      shippedAt: true,
      isPreorder: true,
      preorderShipsAt: true,
      subtotalCents: true,
      discountCents: true,
      shippingCents: true,
      taxCents: true,
      totalCents: true,
      currency: true,
      shippingAddress: true,
      items: {
        select: {
          nameSnapshot: true,
          skuSnapshot: true,
          priceCentsSnapshot: true,
          qty: true,
        },
      },
    },
  });
}
