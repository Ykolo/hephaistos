import { randomBytes } from "node:crypto";
import type { OrderStatus } from "@/generated/prisma/client";
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
 * Commandes — modèle et création (HEP-52), cycle de vie (HEP-53).
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

  // Première entrée du journal : sans elle, la vie de la commande commencerait
  // à son premier changement d'état et sa naissance serait déduite plutôt que
  // lue (HEP-53).
  await tx.orderEvent.create({
    data: {
      orderId: order.id,
      from: null,
      to: "PENDING",
      actorId: actorId({ kind: "customer" }),
      note: "Commande créée depuis le panier.",
    },
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

// --- Cycle de vie (HEP-53) --------------------------------------------------

/**
 * Qui provoque le changement d'état.
 *
 * `actorId` est une chaîne libre en base et le restera : Better Auth (HEP-62)
 * n'existe pas encore, et le webhook Stripe n'aura de toute façon jamais
 * d'identifiant d'utilisateur. Les sentinelles sont donc préfixées pour rester
 * distinguables d'un vrai identifiant le jour où il y en aura.
 */
export type OrderActor =
  | { kind: "admin"; id: string }
  | { kind: "customer" }
  /** Tâche automatique : cron, relance, expiration. */
  | { kind: "system" }
  /** Webhook Stripe — la seule source de vérité du paiement (HEP-59). */
  | { kind: "stripe" };

function actorId(actor: OrderActor): string {
  switch (actor.kind) {
    case "admin":
      return actor.id;
    case "customer":
      return "@client";
    case "system":
      return "@systeme";
    case "stripe":
      return "@stripe";
  }
}

/**
 * **Table de transitions explicite. Tout ce qui n'y figure pas est refusé.**
 *
 * Une commande expédiée ne redevient jamais « en préparation ». Si Jules s'est
 * trompé, on écrit un événement correctif — on ne réécrit pas l'histoire. Un
 * état qui pourrait revenir en arrière rendrait le journal ininterprétable et,
 * plus concrètement, ferait repartir les mails déjà envoyés.
 *
 * `PARTIALLY_REFUNDED` ne figure pas dans l'énoncé de l'issue mais existe dans
 * le schéma : un remboursement partiel (HEP-60) ne clôt pas la commande, et
 * seul un remboursement total la mène à `REFUNDED`.
 *
 * Note d'orthographe : le schéma dit `CANCELED` (un seul L, orthographe
 * américaine), l'issue `CANCELLED`. C'est l'énumération Prisma qui fait foi.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["PAID", "CANCELED"],
  PAID: ["PREPARING", "CANCELED", "PARTIALLY_REFUNDED", "REFUNDED"],
  PREPARING: ["SHIPPED", "CANCELED", "PARTIALLY_REFUNDED", "REFUNDED"],
  SHIPPED: ["DELIVERED", "PARTIALLY_REFUNDED", "REFUNDED"],
  DELIVERED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  PARTIALLY_REFUNDED: ["REFUNDED"],
  // Terminaux : plus rien ne sort d'ici.
  CANCELED: [],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/**
 * Mails transactionnels du lot 6 (HEP-66), déclarés **ici et nulle part
 * ailleurs**.
 *
 * La definition of done demande « exactement un mail, jamais zéro ni deux ».
 * C'est cette table qui le garantit : envoyer depuis l'admin *et* depuis le
 * webhook produirait deux mails pour un même passage à `PAID`, et un état
 * changé par un chemin oublié n'en produirait aucun.
 *
 * `null` est une décision, pas un trou : `PREPARING` est un état interne, et
 * `DELIVERED` est déjà notifié par le transporteur. Prévenir le client que sa
 * commande est « en préparation » n'apporte rien et use la boîte mail.
 */
export const TRANSITION_EMAIL: Record<OrderStatus, string | null> = {
  PENDING: null, // la commande n'est pas payée : rien à annoncer
  PAID: "commande-confirmee",
  PREPARING: null,
  SHIPPED: "commande-expediee",
  DELIVERED: null,
  CANCELED: "commande-annulee",
  PARTIALLY_REFUNDED: "remboursement-partiel",
  REFUNDED: "remboursement",
};

/** Variante précommande : le client attend, le message n'est pas le même. */
const PREORDER_EMAIL: Partial<Record<OrderStatus, string>> = {
  PAID: "precommande-enregistree",
  SHIPPED: "precommande-expediee",
};

export type TransitionInput = {
  orderId: string;
  to: OrderStatus;
  actor: OrderActor;
  /** Motif, référence Stripe, numéro de suivi — ce qui rend le journal lisible. */
  note?: string;
};

export type TransitionResult = {
  from: OrderStatus;
  to: OrderStatus;
  /**
   * `false` quand la commande était **déjà** dans l'état demandé.
   *
   * Ce n'est pas une erreur : le webhook Stripe rejoue ses événements, et un
   * rejeu doit être silencieux. Aucun événement n'est journalisé, aucun mail
   * n'est demandé — c'est ce qui évite le second « commande confirmée ».
   */
  changed: boolean;
  /** Gabarit à envoyer, ou `null` si cette transition n'en déclenche aucun. */
  email: string | null;
};

/**
 * Fait passer une commande d'un état à un autre, ou refuse.
 *
 * ⚠️ **À appeler dans un `$transaction`** : l'écriture de l'état et celle du
 * journal doivent tomber ou passer ensemble. Un état changé sans événement
 * rend le journal menteur, et c'est justement ce que HEP-53 existe pour éviter.
 */
export async function transitionOrder(
  tx: Tx,
  input: TransitionInput,
): Promise<TransitionResult> {
  const order = await tx.order.findUnique({
    where: { id: input.orderId },
    select: { status: true, isPreorder: true },
  });
  if (!order) throw new ActionError("NOT_FOUND", "Cette commande est introuvable.");

  const from = order.status;

  if (from === input.to) {
    return { from, to: input.to, changed: false, email: null };
  }

  if (!canTransition(from, input.to)) {
    throw new ActionError(
      "INVALID_TRANSITION",
      `Une commande ${LABELS[from]} ne peut pas passer ${LABELS[input.to]}.`,
    );
  }

  // Écriture conditionnée à l'état lu : si un autre administrateur — ou le
  // webhook — a bougé la commande entre le SELECT et l'UPDATE, la condition ne
  // matche plus et rien n'est écrit. Un `update` simple aurait écrasé sa
  // décision sans que personne ne le sache.
  const { count } = await tx.order.updateMany({
    where: { id: input.orderId, status: from },
    data: {
      status: input.to,
      ...(input.to === "PAID" ? { paidAt: new Date() } : {}),
      ...(input.to === "SHIPPED" ? { shippedAt: new Date() } : {}),
    },
  });

  if (count === 0) {
    throw new ActionError(
      "INVALID_TRANSITION",
      "Cette commande vient d'être modifiée ailleurs. Rechargez la page.",
    );
  }

  await tx.orderEvent.create({
    data: {
      orderId: input.orderId,
      from,
      to: input.to,
      actorId: actorId(input.actor),
      note: input.note ?? null,
    },
  });

  const email =
    (order.isPreorder ? PREORDER_EMAIL[input.to] : undefined) ??
    TRANSITION_EMAIL[input.to];

  return { from, to: input.to, changed: true, email };
}

/** Libellés français, pour des messages d'erreur lisibles par Jules. */
const LABELS: Record<OrderStatus, string> = {
  PENDING: "en attente de paiement",
  PAID: "payée",
  PREPARING: "en préparation",
  SHIPPED: "expédiée",
  DELIVERED: "livrée",
  CANCELED: "annulée",
  REFUNDED: "remboursée",
  PARTIALLY_REFUNDED: "partiellement remboursée",
};

/**
 * Journal complet d'une commande, du plus ancien au plus récent.
 *
 * Ordonné par date **puis par identifiant** : deux événements écrits dans la
 * même milliseconde — une transition immédiatement suivie d'une autre —
 * sortiraient sinon dans un ordre arbitraire, et l'histoire se lirait à
 * l'envers une fois sur deux.
 */
export async function listOrderEvents(tx: Tx, orderId: string) {
  return tx.orderEvent.findMany({
    where: { orderId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { from: true, to: true, actorId: true, note: true, createdAt: true },
  });
}

/**
 * Note interne libre, visible en administration seulement.
 *
 * Elle n'apparaît ni dans le suivi public (`findOrderByPublicToken` ne la
 * sélectionne pas), ni dans un mail, ni sur la facture. C'est le carnet de
 * Jules : « client rappelé, accepte un envoi le 12 ».
 */
export async function setInternalNote(
  tx: Tx,
  orderId: string,
  note: string,
  actor: OrderActor,
): Promise<void> {
  const trimmed = note.trim();

  const { count } = await tx.order.updateMany({
    where: { id: orderId },
    data: { internalNote: trimmed === "" ? null : trimmed },
  });
  if (count === 0) {
    throw new ActionError("NOT_FOUND", "Cette commande est introuvable.");
  }

  // La note passe aussi au journal : savoir *quand* une consigne a été écrite
  // vaut souvent plus que la consigne elle-même.
  await tx.auditLog.create({
    data: {
      actorId: actorId(actor),
      entity: "Order",
      entityId: orderId,
      action: "internal-note",
    },
  });
}
