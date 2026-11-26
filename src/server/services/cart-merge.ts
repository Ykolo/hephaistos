import type { Tx } from "../db";
import { CART_TTL_DAYS, MAX_QTY_PER_LINE, RESERVATION_MINUTES } from "./cart";
import { availableUnits } from "./stock";

/**
 * Fusion du panier invité avec celui du compte, à la connexion (HEP-49).
 *
 * « Un panier rempli en visiteur, puis connexion : rien n'est perdu, rien
 * n'est dupliqué. » Les règles :
 *
 * - **union des lignes**, quantité = le **max** des deux, jamais la somme. Le
 *   sérum ajouté en visiteur et celui ajouté la semaine dernière sur le
 *   téléphone sont le même désir d'un sérum, pas une envie d'en avoir deux ;
 * - plafond par ligne (`MAX_QTY_PER_LINE`) et stock disponible ;
 * - le panier survivant est l'invité, le plus récent : son code promo gagne ;
 * - les autres paniers du compte disparaissent dans la même transaction ;
 * - le panier reçoit un **nouveau jeton** : celui d'avant la connexion a pu
 *   être lu ou posé par un tiers (fixation), il ne doit rien ouvrir après.
 *
 * Service pur : il ne lit ni n'écrit aucun cookie. L'appelant (le hook de
 * connexion dans `auth.ts`) pose le cookie avec le jeton renvoyé.
 */

export type CartMergeResult = {
  /** Jeton du panier du compte après fusion ; `null` s'il n'y a aucun panier. */
  token: string | null;
  /** Les deux paniers portaient un code promo différent : celui du compte a été écarté. */
  discountReplaced: boolean;
  /** Le code écarté, pour le dire au client (HEP-75). */
  replacedDiscountCode: string | null;
};

function reservationExpiry(): Date {
  return new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);
}

export async function mergeCartsOnSignIn(
  tx: Tx,
  input: { guestToken: string | null; userId: string; newToken: string },
): Promise<CartMergeResult> {
  const guest = input.guestToken
    ? await tx.cart.findUnique({
        where: { token: input.guestToken },
        select: { id: true, userId: true, discountCode: true },
      })
    : null;

  // Le cookie désigne le panier d'un AUTRE compte (ordinateur partagé, ou
  // cookie volé) : on ne le touche pas, il n'appartient pas à ce client.
  const usableGuest = guest && (guest.userId === null || guest.userId === input.userId) ? guest : null;

  const accountCarts = await tx.cart.findMany({
    where: { userId: input.userId, id: usableGuest ? { not: usableGuest.id } : undefined },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      discountCode: true,
      items: { select: { productId: true, qty: true, reservedUntil: true } },
    },
  });

  const target = usableGuest ?? accountCarts.shift();
  if (!target) return { token: null, discountReplaced: false, replacedDiscountCode: null };

  const targetItems = await tx.cartItem.findMany({
    where: { cartId: target.id },
    select: { id: true, productId: true, qty: true },
  });

  // Quantité voulue par produit : le max de tous les paniers.
  const wanted = new Map<string, number>();
  for (const item of targetItems) wanted.set(item.productId, item.qty);
  for (const cart of accountCarts) {
    for (const item of cart.items) {
      wanted.set(item.productId, Math.max(wanted.get(item.productId) ?? 0, item.qty));
    }
  }

  const otherDiscount = accountCarts.find((c) => c.discountCode)?.discountCode ?? null;
  const discountCode = target.discountCode ?? otherDiscount;
  const discountReplaced = Boolean(
    target.discountCode && otherDiscount && otherDiscount !== target.discountCode,
  );

  // Les paniers absorbés disparaissent d'abord : leurs réservations ne
  // doivent pas compter contre le stock que le panier fusionné va demander.
  const now = new Date();
  for (const cart of accountCarts) {
    for (const item of cart.items) {
      if (item.reservedUntil && item.reservedUntil > now) {
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            delta: item.qty,
            reason: "RELEASE",
            note: `Panier ${cart.id} fusionné dans ${target.id}`,
          },
        });
      }
    }
  }
  if (accountCarts.length > 0) {
    await tx.cart.deleteMany({ where: { id: { in: accountCarts.map((c) => c.id) } } });
  }

  const current = new Map(targetItems.map((i) => [i.productId, i]));
  const products = await tx.product.findMany({
    where: { id: { in: [...wanted.keys()] } },
    select: { id: true, availability: true },
  });
  const isPreorder = new Map(products.map((p) => [p.id, p.availability === "PREORDER"]));

  for (const [productId, max] of wanted) {
    let qty = Math.min(max, MAX_QTY_PER_LINE);
    if (!isPreorder.get(productId)) {
      const units = await availableUnits(tx, productId, { excludeCartId: target.id });
      // Plafonné au stock, sans descendre sous 1 : un produit épuisé reste
      // dans le panier, signalé comme indisponible par la vue, plutôt que de
      // disparaître sans explication. « Aucun produit perdu ».
      qty = Math.max(1, Math.min(qty, units));
    }

    const existing = current.get(productId);
    const delta = qty - (existing?.qty ?? 0);
    if (existing) {
      if (delta !== 0) {
        await tx.cartItem.update({ where: { id: existing.id }, data: { qty } });
      }
    } else {
      await tx.cartItem.create({ data: { cartId: target.id, productId, qty } });
    }
    if (delta !== 0) {
      await tx.stockMovement.create({
        data: {
          productId,
          delta: -delta,
          reason: delta > 0 ? "RESERVE" : "RELEASE",
          note: `Panier ${target.id} (fusion à la connexion)`,
        },
      });
    }
  }

  // Le client vient de se connecter : son panier repart pour une demi-heure
  // de réservation, comme après n'importe quelle manipulation.
  await tx.cartItem.updateMany({
    where: { cartId: target.id },
    data: { reservedUntil: reservationExpiry() },
  });
  await tx.cart.update({
    where: { id: target.id },
    data: {
      userId: input.userId,
      token: input.newToken,
      discountCode,
      expiresAt: new Date(Date.now() + CART_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  return {
    token: input.newToken,
    discountReplaced,
    replacedDiscountCode: discountReplaced ? otherDiscount : null,
  };
}
