"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { action } from "../action";
import { RATE_LIMITS } from "../ratelimit";
import { db } from "../db";
import { CART_NOTICE_COOKIE, readCartToken, requireCartToken } from "../cart-session";
import { getSession } from "../auth-guards";
import type { CartView } from "../services/cart";
import {
  addItem,
  applyDiscountCode,
  clearCart,
  emptyCartView,
  getCartView,
  MAX_QTY_PER_LINE,
  removeDiscountCode,
  removeItem,
  updateQty,
} from "../services/cart";
import { setCartShippingMethod } from "../services/shipping";
import { slugSchema } from "@/lib/validation/common";
import { DISCOUNT_CODE_PATTERN, normalizeDiscountCode } from "@/lib/discounts";

/**
 * Server Actions du panier (HEP-46).
 *
 * ⚠️ Aucune de ces actions n'accepte de **prix**. Elles ne prennent qu'un slug
 * et une quantité ; les montants sont recalculés en base à l'affichage. Forger
 * la requête pour y glisser un prix n'a donc aucun effet — c'est la seconde
 * definition of done de l'issue. Même règle pour le code promo (HEP-75) : le
 * client envoie un code, jamais un montant de remise.
 */

const qtySchema = z
  .number({ error: "La quantité doit être un nombre." })
  .int({ error: "La quantité doit être un nombre entier." })
  .min(0, { error: "La quantité ne peut pas être négative." })
  .max(MAX_QTY_PER_LINE, {
    error: `La quantité maximale est de ${MAX_QTY_PER_LINE} par article.`,
  });

/** Rafraîchit les vues qui affichent le panier. */
function revalidateCart() {
  // Le tiroir vit dans le chrome, donc sur toutes les pages.
  revalidatePath("/", "layout");
}

/**
 * Vue du panier, avec le message ponctuel s'il y en a un.
 *
 * Le seul message de ce type aujourd'hui : à la connexion, le code promo du
 * compte a été remplacé par celui du panier invité (HEP-49).
 */
async function view(token: string): Promise<CartView> {
  const cart = await getCartView(db, token);
  const replaced = (await cookies()).get(CART_NOTICE_COOKIE)?.value;
  if (!replaced) return cart;

  // Le cookie est posé par notre propre hook, mais rien n'empêche de le
  // forger : on n'affiche qu'un code bien formé, jamais du texte arbitraire.
  const code = normalizeDiscountCode(replaced);
  if (!DISCOUNT_CODE_PATTERN.test(code)) return cart;

  const kept = cart.discount?.code;
  return {
    ...cart,
    notice: kept
      ? `Le code ${kept} de votre panier a été conservé. Le code ${code}, enregistré sur votre compte, a été retiré : un seul code par commande.`
      : `Le code ${code} enregistré sur votre compte a été retiré : un seul code par commande.`,
  };
}

/**
 * Lecture du panier.
 *
 * Utilise `readCartToken` et **non** `requireCartToken` : consulter un panier
 * ne doit pas en créer un. Sinon chaque visiteur qui affiche une page
 * repartirait avec un cookie et une ligne en base, sans jamais rien ajouter.
 */
export async function getCart(): Promise<CartView> {
  const token = await readCartToken();
  if (!token) return emptyCartView();
  return view(token);
}

export const addToCart = action(
  z.object({ slug: slugSchema, qty: qtySchema.min(1).default(1) }),
  async ({ slug, qty }) => {
    const token = await requireCartToken();
    await addItem(db, token, slug, qty);
    revalidateCart();
    return view(token);
  },
  { name: "cart.add", rateLimit: RATE_LIMITS.cart },
);

export const setCartQty = action(
  z.object({ slug: slugSchema, qty: qtySchema }),
  async ({ slug, qty }) => {
    const token = await requireCartToken();
    await updateQty(db, token, slug, qty);
    revalidateCart();
    return view(token);
  },
  { name: "cart.setQty" },
);

export const removeFromCart = action(
  z.object({ slug: slugSchema }),
  async ({ slug }) => {
    const token = await requireCartToken();
    await removeItem(db, token, slug);
    revalidateCart();
    return view(token);
  },
  { name: "cart.remove" },
);

export const emptyCart = action(
  z.object({}),
  async () => {
    const token = await requireCartToken();
    await clearCart(db, token);
    revalidateCart();
    return view(token);
  },
  { name: "cart.clear" },
);

/**
 * Saisie d'un code promo (HEP-75).
 *
 * Client connecté : la limite « une fois par client » est vérifiée dès
 * maintenant, avec l'email du compte. Visiteur : elle le sera au checkout,
 * quand l'email sera connu — le panier ne réclame pas d'email pour un code.
 */
export const applyDiscount = action(
  z.object({
    code: z
      .string({ error: "Saisissez un code promo." })
      .transform(normalizeDiscountCode)
      .refine((c) => c.length > 0, { error: "Saisissez un code promo." })
      // Un format impossible ne mérite pas une requête en base : il répond
      // comme un code inconnu.
      .refine((c) => DISCOUNT_CODE_PATTERN.test(c), {
        error: "Ce code promo n'existe pas. Vérifiez l'orthographe.",
      }),
  }),
  async ({ code }) => {
    const token = await requireCartToken();
    const session = await getSession();
    await applyDiscountCode(db, token, code, { email: session?.user.email ?? null });
    revalidateCart();
    return view(token);
  },
  { name: "cart.discount.apply", rateLimit: RATE_LIMITS.discount },
);

export const removeDiscount = action(
  z.object({}),
  async () => {
    const token = await requireCartToken();
    await removeDiscountCode(db, token);
    revalidateCart();
    return view(token);
  },
  { name: "cart.discount.remove" },
);

/**
 * Choix du mode de livraison (HEP-70). Le client envoie un mode, jamais un
 * prix : le tarif est relu dans la grille à chaque affichage.
 */
export const chooseShipping = action(
  z.object({
    method: z.enum(["HOME", "PICKUP_POINT"], { error: "Mode de livraison inconnu." }),
  }),
  async ({ method }) => {
    const token = await requireCartToken();
    await setCartShippingMethod(db, token, method);
    revalidateCart();
    return view(token);
  },
  { name: "cart.shipping.choose" },
);

/** Le client a lu le message ponctuel : il ne revient plus. */
export const dismissCartNotice = action(
  z.object({}),
  async () => {
    (await cookies()).delete(CART_NOTICE_COOKIE);
    const token = await readCartToken();
    return token ? getCartView(db, token) : emptyCartView();
  },
  { name: "cart.notice.dismiss" },
);
