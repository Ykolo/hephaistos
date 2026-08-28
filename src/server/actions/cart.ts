"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "../action";
import { db } from "../db";
import { readCartToken, requireCartToken } from "../cart-session";
import type { CartView } from "../services/cart";
import {
  addItem,
  clearCart,
  getCartView,
  MAX_QTY_PER_LINE,
  removeItem,
  updateQty,
} from "../services/cart";
import { slugSchema } from "@/lib/validation/common";

/**
 * Server Actions du panier (HEP-46).
 *
 * ⚠️ Aucune de ces actions n'accepte de **prix**. Elles ne prennent qu'un slug
 * et une quantité ; les montants sont recalculés en base à l'affichage. Forger
 * la requête pour y glisser un prix n'a donc aucun effet — c'est la seconde
 * definition of done de l'issue.
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

/** Panier vide, forme canonique — évite de disperser cette constante. */
const EMPTY: CartView = {
  lines: [],
  itemCount: 0,
  subtotalCents: 0,
  hasUnavailableLines: false,
};

/**
 * Lecture du panier.
 *
 * Utilise `readCartToken` et **non** `requireCartToken` : consulter un panier
 * ne doit pas en créer un. Sinon chaque visiteur qui affiche une page
 * repartirait avec un cookie et une ligne en base, sans jamais rien ajouter.
 */
export async function getCart(): Promise<CartView> {
  const token = await readCartToken();
  if (!token) return EMPTY;
  return getCartView(db, token);
}

export const addToCart = action(
  z.object({ slug: slugSchema, qty: qtySchema.min(1).default(1) }),
  async ({ slug, qty }) => {
    const token = await requireCartToken();
    await addItem(db, token, slug, qty);
    revalidateCart();
    return getCartView(db, token);
  },
  { name: "cart.add", rateLimit: { limit: 60, windowSeconds: 60, by: "session" } },
);

export const setCartQty = action(
  z.object({ slug: slugSchema, qty: qtySchema }),
  async ({ slug, qty }) => {
    const token = await requireCartToken();
    await updateQty(db, token, slug, qty);
    revalidateCart();
    return getCartView(db, token);
  },
  { name: "cart.setQty" },
);

export const removeFromCart = action(
  z.object({ slug: slugSchema }),
  async ({ slug }) => {
    const token = await requireCartToken();
    await removeItem(db, token, slug);
    revalidateCart();
    return getCartView(db, token);
  },
  { name: "cart.remove" },
);

export const emptyCart = action(
  z.object({}),
  async () => {
    const token = await requireCartToken();
    await clearCart(db, token);
    revalidateCart();
    return getCartView(db, token);
  },
  { name: "cart.clear" },
);
