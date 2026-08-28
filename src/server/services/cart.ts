import type { Tx } from "../db";
import { ActionError } from "../errors";
import { availableUnits } from "./stock";

/**
 * Panier serveur (HEP-46).
 *
 * Le panier **ne stocke aucun montant**. Il ne contient que des couples
 * `(productId, qty)` ; tous les prix sont recalculés depuis la base à
 * l'affichage comme au paiement. Un panier qui transporterait des prix
 * laisserait le client les modifier avant envoi.
 *
 * Service pur : il reçoit le token, jamais les cookies. La lecture du cookie
 * est le travail de l'appelant (`src/server/cart-session.ts`).
 */

/** Garde-fou anti-abus. Personne n'achète 400 flacons de sérum par erreur. */
export const MAX_QTY_PER_LINE = 10;

/** Durée de vie du panier. Prolongée à chaque interaction. */
export const CART_TTL_DAYS = 30;

function expiry(): Date {
  return new Date(Date.now() + CART_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Retrouve le panier du token, ou le crée.
 *
 * Un panier expiré est **réutilisé** plutôt que recréé : le client qui revient
 * après cinq semaines retrouve son panier plutôt qu'un tiroir vide. Ce sont
 * les réservations de stock qui expirent (HEP-48), pas le panier lui-même.
 */
export async function getOrCreateCart(db: Tx, token: string) {
  const existing = await db.cart.findUnique({
    where: { token },
    select: { id: true },
  });
  if (existing) return existing;

  return db.cart.create({
    data: { token, expiresAt: expiry() },
    select: { id: true },
  });
}

/** Prolonge la durée de vie — appelé à chaque mutation. */
async function touch(db: Tx, cartId: string) {
  await db.cart.update({
    where: { id: cartId },
    data: { expiresAt: expiry() },
  });
}

/**
 * Vérifie qu'un produit est réellement achetable, et en quelle quantité.
 *
 * Le contrôle vit ici et pas dans l'action : c'est la seule façon de garantir
 * qu'aucun chemin d'ajout ne puisse le contourner.
 */
async function assertPurchasable(db: Tx, slug: string, qty: number) {
  if (!Number.isInteger(qty) || qty < 1) {
    throw new ActionError("VALIDATION", "La quantité doit être d'au moins 1.");
  }
  if (qty > MAX_QTY_PER_LINE) {
    throw new ActionError(
      "VALIDATION",
      `La quantité maximale est de ${MAX_QTY_PER_LINE} par article.`,
    );
  }

  const product = await db.product.findUnique({
    where: { slug },
    select: { id: true, name: true, status: true, availability: true },
  });
  if (!product) throw new ActionError("NOT_FOUND", "Ce produit est introuvable.");

  // Un brouillon ou un archivé n'est pas visible sur le site : s'il arrive
  // ici, c'est une URL devinée ou une requête forgée.
  if (product.status !== "PUBLISHED") {
    throw new ActionError(
      "PRODUCT_UNAVAILABLE",
      "Ce produit n'est pas disponible à la vente.",
    );
  }

  if (product.availability === "DISCONTINUED" || product.availability === "COMING_SOON") {
    throw new ActionError(
      "PRODUCT_UNAVAILABLE",
      `« ${product.name} » n'est pas encore disponible à la vente.`,
    );
  }

  // La précommande se vend sans stock : c'est sa raison d'être (HEP-42).
  if (product.availability !== "PREORDER") {
    const units = await availableUnits(db, product.id);
    if (units < qty) {
      throw new ActionError(
        "OUT_OF_STOCK",
        units === 0
          ? `« ${product.name} » est épuisé.`
          : `Il ne reste que ${units} exemplaire(s) de « ${product.name} ».`,
      );
    }
  }

  return product;
}

/**
 * Ajoute un article, ou augmente la ligne existante.
 *
 * L'ajout est **cumulatif** : ajouter deux fois le même produit fait 2, pas
 * deux lignes. Le plafond s'applique au total de la ligne, pas à l'ajout.
 */
export async function addItem(
  db: Tx,
  token: string,
  slug: string,
  qty = 1,
): Promise<void> {
  const cart = await getOrCreateCart(db, token);

  const existing = await db.cartItem.findFirst({
    where: { cartId: cart.id, product: { slug } },
    select: { id: true, qty: true },
  });

  const target = (existing?.qty ?? 0) + qty;
  const product = await assertPurchasable(db, slug, target);

  if (existing) {
    await db.cartItem.update({
      where: { id: existing.id },
      data: { qty: target },
    });
  } else {
    await db.cartItem.create({
      data: { cartId: cart.id, productId: product.id, qty: target },
    });
  }

  await touch(db, cart.id);
}

/** Fixe la quantité d'une ligne. `0` retire la ligne. */
export async function updateQty(
  db: Tx,
  token: string,
  slug: string,
  qty: number,
): Promise<void> {
  if (qty <= 0) return removeItem(db, token, slug);

  const cart = await getOrCreateCart(db, token);
  await assertPurchasable(db, slug, qty);

  const item = await db.cartItem.findFirst({
    where: { cartId: cart.id, product: { slug } },
    select: { id: true },
  });
  if (!item) throw new ActionError("NOT_FOUND", "Cet article n'est pas dans le panier.");

  await db.cartItem.update({ where: { id: item.id }, data: { qty } });
  await touch(db, cart.id);
}

export async function removeItem(
  db: Tx,
  token: string,
  slug: string,
): Promise<void> {
  const cart = await getOrCreateCart(db, token);
  await db.cartItem.deleteMany({
    where: { cartId: cart.id, product: { slug } },
  });
  await touch(db, cart.id);
}

export async function clearCart(db: Tx, token: string): Promise<void> {
  const cart = await getOrCreateCart(db, token);
  await db.cartItem.deleteMany({ where: { cartId: cart.id } });
  await touch(db, cart.id);
}

export type CartLine = {
  slug: string;
  name: string;
  qty: number;
  /** Prix unitaire **relu en base**, jamais transmis par le client. */
  unitPriceCents: number;
  lineTotalCents: number;
  image: string;
  /**
   * Unités réellement disponibles.
   *
   * Toujours un nombre fini, y compris en précommande — une valeur infinie ne
   * survivrait pas à la sérialisation vers le client (`Infinity` devient
   * `null` en JSON). Pour une précommande, se fier à `isPreorder` plutôt qu'à
   * ce compteur, qui peut être négatif : il représente alors les unités dues.
   */
  availableUnits: number;
  isPreorder: boolean;
  preorderShipsAt: Date | null;
};

export type CartView = {
  lines: CartLine[];
  itemCount: number;
  /**
   * Somme des lignes. Ce n'est **pas** le total à payer : remise, livraison
   * et TVA relèvent du moteur de prix (HEP-47).
   */
  subtotalCents: number;
  /** Lignes dont la quantité dépasse le stock devenu disponible. */
  hasUnavailableLines: boolean;
};

/**
 * Vue du panier pour l'affichage.
 *
 * Tous les prix viennent de la base à cet instant. Si un prix a changé depuis
 * l'ajout, c'est le nouveau qui s'affiche — le panier ne fige rien. Le figeage
 * n'intervient qu'à la création de la commande (`OrderItem`, HEP-52).
 */
export async function getCartView(db: Tx, token: string): Promise<CartView> {
  const cart = await db.cart.findUnique({
    where: { token },
    select: {
      items: {
        orderBy: { id: "asc" },
        select: {
          qty: true,
          product: {
            select: {
              id: true,
              slug: true,
              name: true,
              priceCents: true,
              availability: true,
              preorderShipsAt: true,
              images: {
                where: { role: "PRIMARY" },
                take: 1,
                select: { blobUrl: true },
              },
            },
          },
        },
      },
    },
  });

  if (!cart) {
    return { lines: [], itemCount: 0, subtotalCents: 0, hasUnavailableLines: false };
  }

  const lines: CartLine[] = [];
  for (const item of cart.items) {
    const p = item.product;
    const isPreorder = p.availability === "PREORDER";
    const units = await availableUnits(db, p.id);

    lines.push({
      slug: p.slug,
      name: p.name,
      qty: item.qty,
      unitPriceCents: p.priceCents,
      lineTotalCents: p.priceCents * item.qty,
      image: p.images[0]?.blobUrl ?? "",
      availableUnits: units,
      isPreorder,
      preorderShipsAt: p.preorderShipsAt,
    });
  }

  return {
    lines,
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
    subtotalCents: lines.reduce((n, l) => n + l.lineTotalCents, 0),
    // La précommande est exclue : son stock est négatif par construction, ce
    // n'est pas une indisponibilité mais un compteur de flacons dus.
    hasUnavailableLines: lines.some(
      (l) => !l.isPreorder && l.qty > l.availableUnits,
    ),
  };
}
