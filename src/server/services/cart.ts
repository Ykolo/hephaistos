import type { Tx } from "../db";
import { ActionError } from "../errors";
import { computeTotals, type Totals } from "./pricing";
import { availableUnits } from "./stock";
import type { StockReason } from "@/generated/prisma/client";

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

/**
 * Durée d'une réservation de stock (HEP-48).
 *
 * 30 minutes, alignées sur l'expiration d'une session Stripe Checkout.
 *
 * Plus court, le client perd son panier en cherchant sa carte. Plus long, des
 * paniers fantômes affichent « rupture » à de vrais clients — sur douze
 * flacons en stock, quelques abandons suffisent à bloquer la boutique.
 */
export const RESERVATION_MINUTES = 30;

function expiry(): Date {
  return new Date(Date.now() + CART_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function reservationExpiry(): Date {
  return new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);
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

/**
 * Prolonge la durée de vie du panier **et** de ses réservations.
 *
 * Appelé à chaque mutation : un client qui manipule son panier ne doit pas
 * voir son stock libéré sous lui pendant qu'il hésite.
 */
async function touch(db: Tx, cartId: string) {
  await db.cart.update({
    where: { id: cartId },
    data: { expiresAt: expiry() },
  });
  await db.cartItem.updateMany({
    where: { cartId },
    data: { reservedUntil: reservationExpiry() },
  });
}

/**
 * Trace une réservation ou sa libération.
 *
 * Ces mouvements sont exclus du contrôle de cohérence du stock (cf.
 * `stockFromMovements`) : ils ne déplacent rien, ils documentent pourquoi un
 * produit a pu paraître indisponible à un instant donné.
 */
async function recordReservation(
  db: Tx,
  productId: string,
  qty: number,
  reason: Extract<StockReason, "RESERVE" | "RELEASE">,
  cartId: string,
) {
  if (qty === 0) return;
  await db.stockMovement.create({
    data: {
      productId,
      delta: reason === "RESERVE" ? -qty : qty,
      reason,
      note: `Panier ${cartId}`,
    },
  });
}

/**
 * Vérifie qu'un produit est réellement achetable, et en quelle quantité.
 *
 * Le contrôle vit ici et pas dans l'action : c'est la seule façon de garantir
 * qu'aucun chemin d'ajout ne puisse le contourner.
 */
async function assertPurchasable(
  db: Tx,
  slug: string,
  qty: number,
  cartId?: string,
) {
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
    // `excludeCartId` : sans lui, le client verrait sa propre réservation
    // comme un obstacle et ne pourrait jamais passer de 1 à 2.
    const units = await availableUnits(db, product.id, {
      excludeCartId: cartId,
    });
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
  const product = await assertPurchasable(db, slug, target, cart.id);

  if (existing) {
    await db.cartItem.update({
      where: { id: existing.id },
      data: { qty: target, reservedUntil: reservationExpiry() },
    });
  } else {
    await db.cartItem.create({
      data: {
        cartId: cart.id,
        productId: product.id,
        qty: target,
        reservedUntil: reservationExpiry(),
      },
    });
  }

  await recordReservation(db, product.id, qty, "RESERVE", cart.id);
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
  const product = await assertPurchasable(db, slug, qty, cart.id);

  const item = await db.cartItem.findFirst({
    where: { cartId: cart.id, product: { slug } },
    select: { id: true, qty: true },
  });
  if (!item) throw new ActionError("NOT_FOUND", "Cet article n'est pas dans le panier.");

  await db.cartItem.update({
    where: { id: item.id },
    data: { qty, reservedUntil: reservationExpiry() },
  });

  // Seul l'écart est tracé : passer de 2 à 5 réserve 3 de plus, pas 5.
  const delta = qty - item.qty;
  if (delta > 0) {
    await recordReservation(db, product.id, delta, "RESERVE", cart.id);
  } else if (delta < 0) {
    await recordReservation(db, product.id, -delta, "RELEASE", cart.id);
  }

  await touch(db, cart.id);
}

export async function removeItem(
  db: Tx,
  token: string,
  slug: string,
): Promise<void> {
  const cart = await getOrCreateCart(db, token);

  const item = await db.cartItem.findFirst({
    where: { cartId: cart.id, product: { slug } },
    select: { id: true, qty: true, productId: true, reservedUntil: true },
  });
  if (!item) return;

  await db.cartItem.delete({ where: { id: item.id } });

  // Une réservation déjà expirée a été libérée par le cron : la libérer une
  // seconde fois ferait apparaître un stock qui n'existe pas.
  if (item.reservedUntil && item.reservedUntil > new Date()) {
    await recordReservation(db, item.productId, item.qty, "RELEASE", cart.id);
  }

  await touch(db, cart.id);
}

export async function clearCart(db: Tx, token: string): Promise<void> {
  const cart = await getOrCreateCart(db, token);

  const items = await db.cartItem.findMany({
    where: { cartId: cart.id },
    select: { qty: true, productId: true, reservedUntil: true },
  });

  await db.cartItem.deleteMany({ where: { cartId: cart.id } });

  const now = new Date();
  for (const item of items) {
    if (item.reservedUntil && item.reservedUntil > now) {
      await recordReservation(db, item.productId, item.qty, "RELEASE", cart.id);
    }
  }

  await touch(db, cart.id);
}

/**
 * Libère les réservations échues (HEP-48).
 *
 * Appelé par le cron. Sans lui, un panier abandonné bloquerait le dernier
 * flacon indéfiniment.
 *
 * La ligne de panier est **conservée** : seule la réservation tombe. Le client
 * qui revient retrouve son panier ; c'est au moment de valider que la
 * disponibilité sera revérifiée. Supprimer la ligne le priverait de sa
 * sélection pour une raison qu'il ne comprendrait pas.
 */
export async function releaseExpiredReservations(
  db: Tx,
): Promise<{ released: number; units: number }> {
  const expired = await db.cartItem.findMany({
    where: { reservedUntil: { not: null, lte: new Date() } },
    select: { id: true, qty: true, productId: true, cartId: true },
  });

  if (expired.length === 0) return { released: 0, units: 0 };

  // `reservedUntil` passe à null en premier : si la trace échoue ensuite, on
  // aura un mouvement manquant plutôt qu'une réservation libérée deux fois.
  await db.cartItem.updateMany({
    where: { id: { in: expired.map((e) => e.id) } },
    data: { reservedUntil: null },
  });

  for (const item of expired) {
    await recordReservation(db, item.productId, item.qty, "RELEASE", item.cartId);
  }

  return {
    released: expired.length,
    units: expired.reduce((n, e) => n + e.qty, 0),
  };
}

export type CartLine = {
  /**
   * Identifiant de la ligne pour le moteur de prix, et cible d'une remise
   * produit (HEP-75). Rien de confidentiel : c'est le même identifiant que
   * l'admin manipule.
   */
  productId: string;
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
   * Montants calculés par le moteur de prix (HEP-47) — la **seule**
   * implémentation, partagée avec Stripe, la commande et la facture.
   *
   * Aucun mode de livraison n'est fourni à ce stade : `totals.shippingKnown`
   * vaut `false` et `totals.totalCents` est un total hors livraison. C'est au
   * tunnel (HEP-58) de repasser par `computeTotals` avec le mode retenu.
   */
  totals: Totals;
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
      id: true,
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

  if (!cart) return emptyCartView();

  // Les montants ne sont jamais recalculés ici : le moteur de prix (HEP-47)
  // est la seule implémentation, du tiroir jusqu'à la facture.
  const totals = computeTotals({
    lines: cart.items.map((item) => ({
      productId: item.product.id,
      qty: item.qty,
      unitPriceCents: item.product.priceCents,
    })),
  });

  const lines: CartLine[] = [];
  for (const [index, item] of cart.items.entries()) {
    const p = item.product;
    // Le panier courant est exclu : sinon chaque ligne se verrait elle-même
    // comme une indisponibilité et s'afficherait en rouge.
    const units = await availableUnits(db, p.id, { excludeCartId: cart.id });

    lines.push({
      productId: p.id,
      slug: p.slug,
      name: p.name,
      qty: item.qty,
      unitPriceCents: p.priceCents,
      lineTotalCents: totals.lines[index].lineTotalCents,
      image: p.images[0]?.blobUrl ?? "",
      availableUnits: units,
      isPreorder: p.availability === "PREORDER",
      preorderShipsAt: p.preorderShipsAt,
    });
  }

  return {
    lines,
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
    totals,
    // La précommande est exclue : son stock est négatif par construction, ce
    // n'est pas une indisponibilité mais un compteur de flacons dus.
    hasUnavailableLines: lines.some(
      (l) => !l.isPreorder && l.qty > l.availableUnits,
    ),
  };
}

/**
 * Panier vide, forme canonique.
 *
 * Une fonction et non une constante partagée : cette vue part chez le client,
 * et un objet unique traversant toutes les requêtes finirait par être muté par
 * l'une d'elles. Le jour où `CartView` gagne un champ, le panier vide le gagne
 * aussi — sans littéral recopié dans trois fichiers.
 */
export function emptyCartView(): CartView {
  return {
    lines: [],
    itemCount: 0,
    totals: computeTotals({ lines: [] }),
    hasUnavailableLines: false,
  };
}
