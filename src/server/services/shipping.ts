import type { ShippingMethod } from "@/generated/prisma/client";
import type { Tx } from "../db";
import { ActionError } from "../errors";
import {
  parcelWeightGrams,
  rateFor,
  SHIPPING_METHOD_LABELS,
  type ShippingRateView,
} from "@/lib/shipping";

/**
 * Grille de frais de port (HEP-70) : lecture, choix du mode sur le panier,
 * administration.
 *
 * Le calcul lui-même est dans `src/lib/shipping.ts`, pur, pour que le
 * navigateur choisisse la même tranche que le serveur.
 */

const rateViewSelect = {
  carrier: true,
  method: true,
  maxWeightGrams: true,
  priceCents: true,
  freeAboveCents: true,
} as const;

/** Grille active, de la tranche la plus légère à la plus lourde. */
export async function activeShippingRates(db: Tx): Promise<ShippingRateView[]> {
  return db.shippingRate.findMany({
    where: { active: true },
    orderBy: [{ method: "asc" }, { maxWeightGrams: "asc" }],
    select: rateViewSelect,
  });
}

/**
 * Pose le mode de livraison sur le panier.
 *
 * Refusé si aucune tranche active ne couvre le poids du colis : mieux vaut le
 * dire ici qu'au paiement.
 */
export async function setCartShippingMethod(
  db: Tx,
  token: string,
  method: ShippingMethod,
): Promise<void> {
  const cart = await db.cart.findUnique({
    where: { token },
    select: {
      id: true,
      items: { select: { qty: true, product: { select: { weightGrams: true } } } },
    },
  });
  if (!cart || cart.items.length === 0) {
    throw new ActionError("NOT_FOUND", "Votre panier est vide.");
  }

  const weight = parcelWeightGrams(
    cart.items.map((i) => ({ qty: i.qty, weightGrams: i.product.weightGrams })),
  );
  const rate = rateFor(await activeShippingRates(db), method, weight);
  if (!rate) {
    throw new ActionError(
      "SHIPPING_UNAVAILABLE",
      `${SHIPPING_METHOD_LABELS[method]} n'est pas disponible pour ce colis.`,
    );
  }

  await db.cart.update({ where: { id: cart.id }, data: { shippingMethod: method } });
}

/**
 * Tarif de la commande, relu en base au moment de la créer.
 *
 * Jamais reçu de l'appelant, comme la remise : le mode vient du panier, le
 * prix de la grille du moment.
 */
export async function shippingForOrder(
  db: Tx,
  input: { method: ShippingMethod | null; lines: readonly { qty: number; weightGrams: number }[] },
): Promise<ShippingRateView> {
  if (!input.method) {
    throw new ActionError("SHIPPING_UNAVAILABLE", "Choisissez un mode de livraison.");
  }
  const rate = rateFor(await activeShippingRates(db), input.method, parcelWeightGrams(input.lines));
  if (!rate) {
    throw new ActionError(
      "SHIPPING_UNAVAILABLE",
      `${SHIPPING_METHOD_LABELS[input.method]} n'est plus disponible pour ce colis. Choisissez un autre mode.`,
    );
  }
  return rate;
}

// --- Administration ----------------------------------------------------------

export type ShippingRateAdminInput = {
  id: string | null;
  carrier: string;
  method: ShippingMethod;
  maxWeightGrams: number;
  priceCents: number;
  freeAboveCents: number | null;
  active: boolean;
};

export async function listShippingRates(db: Tx) {
  return db.shippingRate.findMany({
    orderBy: [{ method: "asc" }, { maxWeightGrams: "asc" }],
    select: { id: true, active: true, updatedAt: true, ...rateViewSelect },
  });
}

/**
 * Crée ou modifie une tranche, et l'inscrit au journal.
 *
 * Un changement de tarif ne touche aucune commande passée : leurs frais de
 * port sont figés sur la commande (HEP-52).
 */
export async function saveShippingRate(
  tx: Tx,
  input: ShippingRateAdminInput,
  actorId: string,
): Promise<{ id: string; created: boolean }> {
  const data = {
    carrier: input.carrier,
    method: input.method,
    maxWeightGrams: input.maxWeightGrams,
    priceCents: input.priceCents,
    freeAboveCents: input.freeAboveCents,
    active: input.active,
  };

  const clash = await tx.shippingRate.findUnique({
    where: { method_maxWeightGrams: { method: input.method, maxWeightGrams: input.maxWeightGrams } },
    select: { id: true },
  });
  if (clash && clash.id !== input.id) {
    throw new ActionError("VALIDATION", "Cette tranche existe déjà pour ce mode.", {
      maxWeightGrams: "Une tranche avec ce poids existe déjà pour ce mode : modifiez-la.",
    });
  }

  if (input.id) {
    const { count } = await tx.shippingRate.updateMany({ where: { id: input.id }, data });
    if (count === 0) throw new ActionError("NOT_FOUND", "Ce tarif est introuvable.");
    await tx.auditLog.create({
      data: { actorId, entity: "ShippingRate", entityId: input.id, action: "update", diff: data },
    });
    return { id: input.id, created: false };
  }

  const created = await tx.shippingRate.create({ data, select: { id: true } });
  await tx.auditLog.create({
    data: { actorId, entity: "ShippingRate", entityId: created.id, action: "create", diff: data },
  });
  return { id: created.id, created: true };
}

/**
 * Supprime une tranche.
 *
 * Possible, contrairement à un code promo : aucune commande ne pointe vers
 * une tranche, le prix payé est recopié sur la commande. Le journal garde
 * l'ancienne valeur.
 */
export async function deleteShippingRate(tx: Tx, id: string, actorId: string): Promise<void> {
  const rate = await tx.shippingRate.findUnique({ where: { id }, select: rateViewSelect });
  if (!rate) throw new ActionError("NOT_FOUND", "Ce tarif est introuvable.");
  await tx.shippingRate.delete({ where: { id } });
  await tx.auditLog.create({
    data: { actorId, entity: "ShippingRate", entityId: id, action: "delete", diff: rate },
  });
}
