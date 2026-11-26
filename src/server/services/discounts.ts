import type { DiscountType } from "@/generated/prisma/client";
import type { Tx } from "../db";
import { ActionError, type ErrorCode } from "../errors";
import {
  discountRefusalMessage,
  normalizeDiscountCode,
  type DiscountRefusal,
} from "@/lib/discounts";
import { computeTotals, type PricingDiscount, type PricingLine } from "./pricing";
import { RESERVATION_MINUTES } from "./cart";

/**
 * Codes promo (HEP-75) : validation, réservation au checkout, consommation au
 * paiement.
 *
 * Trois moments, trois fonctions, et c'est volontaire :
 *
 * 1. **saisie** dans le panier — `checkDiscount` : le code est-il valable pour
 *    ce panier ? Rien n'est consommé ;
 * 2. **checkout** — `claimDiscountForOrder` : revalidation complète, sous
 *    verrou, au moment où la commande est créée. Un code peut avoir expiré
 *    entre la saisie et le paiement, et deux clients peuvent tenter le même
 *    code à usage unique à la même seconde ;
 * 3. **paiement confirmé** — `redeemDiscount`, appelé par le webhook Stripe
 *    (HEP-59) : le compteur n'augmente qu'ici. Un paiement abandonné ne
 *    consomme rien.
 *
 * Le montant de la remise n'est jamais calculé dans ce fichier : il sort de
 * `computeTotals` (HEP-47), comme partout ailleurs.
 */

/**
 * Durée pendant laquelle une commande `PENDING` garde « sa » place sur un code
 * limité.
 *
 * Alignée sur la session Stripe (`expires_at` à 30 min, HEP-58), plus une
 * marge : la session est créée juste *après* la commande et expire donc un peu
 * plus tard qu'elle. Sans cette marge, un second client pourrait obtenir la
 * dernière place pendant les quelques secondes où le premier peut encore payer.
 */
export function discountHoldMinutes(): number {
  // Une fonction et non une constante : `cart.ts` importe ce module, et une
  // constante évaluée au chargement lirait `RESERVATION_MINUTES` avant qu’il
  // ne soit défini (import circulaire).
  return RESERVATION_MINUTES + 5;
}

/** Les colonnes dont la validation a besoin. */
export const discountSelect = {
  id: true,
  code: true,
  type: true,
  value: true,
  minOrderCents: true,
  productId: true,
  startsAt: true,
  endsAt: true,
  maxUses: true,
  maxUsesPerCustomer: true,
  usedCount: true,
  active: true,
} as const;

export type DiscountRow = {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  minOrderCents: number | null;
  productId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  maxUsesPerCustomer: number;
  usedCount: number;
  active: boolean;
};

export type DiscountCheck =
  | { ok: true; discount: PricingDiscount }
  | { ok: false; reason: DiscountRefusal; message: string };

export type DiscountUsage = {
  /**
   * Places déjà prises par d'**autres** clients dont le paiement est en cours.
   * Comptées avec `usedCount` contre `maxUses`.
   */
  pendingByOthers?: number;
  /**
   * Utilisations payées par ce client. `null` quand le client n'est pas
   * identifié (visiteur sans email) : la règle « une fois par client » est
   * alors vérifiée plus tard, au checkout, où l'email est connu.
   */
  byCustomer?: number | null;
};

function refuse(reason: DiscountRefusal, row?: DiscountRow | null): DiscountCheck {
  return {
    ok: false,
    reason,
    message: discountRefusalMessage(reason, { minOrderCents: row?.minOrderCents }),
  };
}

export function toPricingDiscount(row: DiscountRow): PricingDiscount {
  return {
    code: row.code,
    type: row.type,
    value: row.value,
    minOrderCents: row.minOrderCents,
    productId: row.productId,
  };
}

/**
 * Juge un code pour un panier. **Fonction pure** : la ligne `Discount` et les
 * compteurs arrivent déjà lus, l'heure est passée en argument.
 *
 * L'ordre des contrôles est celui que le client comprend : d'abord ce qui
 * tient au code (existe-t-il, est-il dans ses dates, reste-t-il des places),
 * ensuite ce qui tient au panier. Annoncer « minimum non atteint » pour un
 * code expiré pousserait le client à ajouter un article pour rien.
 */
export function validateDiscount(
  row: DiscountRow | null,
  context: { now: Date; lines: readonly PricingLine[]; usage?: DiscountUsage },
): DiscountCheck {
  // Un code désactivé répond comme un code inconnu : le distinguer dirait à
  // qui teste des codes au hasard qu'il en a trouvé un vrai.
  if (!row || !row.active) return refuse("UNKNOWN");

  const now = context.now.getTime();
  if (row.startsAt && now < row.startsAt.getTime()) return refuse("NOT_STARTED", row);
  // `endsAt` est exclusif : c'est l'instant où le code cesse de valoir.
  if (row.endsAt && now >= row.endsAt.getTime()) return refuse("EXPIRED", row);

  const usage = context.usage ?? {};
  if (row.maxUses != null && row.usedCount + (usage.pendingByOthers ?? 0) >= row.maxUses) {
    return refuse("EXHAUSTED", row);
  }
  if (usage.byCustomer != null && usage.byCustomer >= row.maxUsesPerCustomer) {
    return refuse("ALREADY_USED", row);
  }

  // Ce qui dépend du panier, le moteur de prix le juge déjà : refaire ici le
  // test du minimum, c'est risquer deux règles qui divergent d'un centime.
  const discount = toPricingDiscount(row);
  const totals = computeTotals({ lines: context.lines, discount });
  if (totals.discountRejectedFor) return refuse(totals.discountRejectedFor, row);

  return { ok: true, discount };
}

/** Code d'erreur du contrat HEP-34 correspondant à un refus. */
export function refusalErrorCode(reason: DiscountRefusal): ErrorCode {
  switch (reason) {
    case "EXPIRED":
    case "NOT_STARTED":
      return "DISCOUNT_EXPIRED";
    case "EXHAUSTED":
    case "ALREADY_USED":
      return "DISCOUNT_ALREADY_USED";
    default:
      return "INVALID_DISCOUNT";
  }
}

export async function findDiscount(tx: Tx, rawCode: string): Promise<DiscountRow | null> {
  const code = normalizeDiscountCode(rawCode);
  if (!code) return null;
  return tx.discount.findUnique({ where: { code }, select: discountSelect });
}

/** Utilisations **payées** de ce code par cette adresse, casse ignorée. */
async function paidUsesBy(tx: Tx, discountId: string, email: string): Promise<number> {
  return tx.discountRedemption.count({
    where: { discountId, email: { equals: email.trim(), mode: "insensitive" } },
  });
}

/**
 * Commandes en attente de paiement qui portent ce code, hors ce client.
 *
 * Celles du client lui-même sont exclues : il relance son paiement après une
 * fausse manœuvre, il ne doit pas se voir refuser son propre code par la
 * commande qu'il vient d'abandonner.
 */
async function pendingHoldsByOthers(
  tx: Tx,
  code: string,
  email: string,
  now: Date,
): Promise<number> {
  return tx.order.count({
    where: {
      discountCode: code,
      status: "PENDING",
      createdAt: { gt: new Date(now.getTime() - discountHoldMinutes() * 60_000) },
      NOT: { email: { equals: email.trim(), mode: "insensitive" } },
    },
  });
}

/**
 * Vérifie un code pour le panier, sans rien consommer.
 *
 * Avec un email (client connecté), la limite par client est vérifiée ; sans
 * email, elle le sera au checkout.
 */
export async function checkDiscount(
  tx: Tx,
  input: { code: string; lines: readonly PricingLine[]; email?: string | null; now?: Date },
): Promise<DiscountCheck & { row: DiscountRow | null }> {
  const row = await findDiscount(tx, input.code);
  const byCustomer = row && input.email ? await paidUsesBy(tx, row.id, input.email) : null;
  const check = validateDiscount(row, {
    now: input.now ?? new Date(),
    lines: input.lines,
    usage: { byCustomer },
  });
  return { ...check, row };
}

/**
 * Revalidation **sous verrou** au moment de créer la commande.
 *
 * Le `FOR UPDATE` sérialise les checkouts qui portent le même code : le second
 * attend que le premier ait validé sa transaction, puis compte sa commande
 * `PENDING` parmi les places prises. C'est ce qui fait qu'un code à usage
 * unique ne passe pas deux fois, même tenté à la même milliseconde. Sans
 * verrou, les deux transactions liraient « 0 utilisation » en même temps.
 *
 * Refus = `ActionError` : la commande n'est pas créée, et le client revient au
 * panier avec le message. Créer la commande sans la remise lui ferait payer
 * plus que le montant qu'il vient de lire.
 *
 * ⚠️ À appeler dans la transaction qui crée la commande.
 */
export async function claimDiscountForOrder(
  tx: Tx,
  input: { code: string; lines: readonly PricingLine[]; email: string; now?: Date },
): Promise<PricingDiscount> {
  const code = normalizeDiscountCode(input.code);
  await tx.$queryRaw`SELECT id FROM "Discount" WHERE code = ${code} FOR UPDATE`;

  const now = input.now ?? new Date();
  const row = await findDiscount(tx, code);
  const usage: DiscountUsage = row
    ? {
        byCustomer: await paidUsesBy(tx, row.id, input.email),
        pendingByOthers: await pendingHoldsByOthers(tx, row.code, input.email, now),
      }
    : {};

  const check = validateDiscount(row, { now, lines: input.lines, usage });
  if (!check.ok) throw new ActionError(refusalErrorCode(check.reason), check.message);
  return check.discount;
}

export type RedeemResult = {
  /** `false` : rejeu du webhook, l'utilisation était déjà comptée. */
  redeemed: boolean;
  /**
   * La limite était déjà atteinte au moment du paiement.
   *
   * Ne devrait pas arriver — le checkout a réservé la place — sauf pour un
   * même client qui paie deux commandes en parallèle dans deux onglets.
   * L'utilisation est tout de même comptée : l'argent est encaissé, et la
   * vérité du compteur compte plus qu'une limite déjà dépassée. Le webhook la
   * signale dans le journal de la commande.
   */
  overLimit: boolean;
};

/**
 * Consomme le code d'une commande payée.
 *
 * **Seul** endroit où `usedCount` augmente. Idempotent : le webhook Stripe
 * peut livrer deux fois le même événement, et la contrainte unique
 * `(discountId, orderId)` empêche de compter deux fois.
 *
 * ⚠️ À appeler dans la transaction qui passe la commande en `PAID`.
 */
export async function redeemDiscount(tx: Tx, orderId: string): Promise<RedeemResult | null> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { discountCode: true, email: true },
  });
  if (!order?.discountCode) return null;

  await tx.$queryRaw`SELECT id FROM "Discount" WHERE code = ${order.discountCode} FOR UPDATE`;
  const row = await tx.discount.findUnique({
    where: { code: order.discountCode },
    select: discountSelect,
  });
  // Code supprimé depuis la commande : rien à compter, la remise figée sur la
  // commande reste ce qu'elle est.
  if (!row) return null;

  const { count } = await tx.discountRedemption.createMany({
    data: [{ discountId: row.id, orderId, email: order.email }],
    skipDuplicates: true,
  });
  if (count === 0) return { redeemed: false, overLimit: false };

  const byCustomer = await paidUsesBy(tx, row.id, order.email);
  const overLimit =
    (row.maxUses != null && row.usedCount >= row.maxUses) ||
    byCustomer > row.maxUsesPerCustomer;

  await tx.discount.update({
    where: { id: row.id },
    data: { usedCount: { increment: 1 } },
  });

  return { redeemed: true, overLimit };
}

// --- Administration --------------------------------------------------------

export type DiscountAdminInput = {
  id: string | null;
  code: string;
  type: DiscountType;
  value: number;
  minOrderCents: number | null;
  productSlug: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  maxUsesPerCustomer: number;
  active: boolean;
};

export async function listDiscounts(tx: Tx) {
  return tx.discount.findMany({
    orderBy: [{ active: "desc" }, { code: "asc" }],
    select: {
      ...discountSelect,
      product: { select: { slug: true, name: true } },
      _count: { select: { redemptions: true } },
    },
  });
}

/** JSON du journal : les dates en ISO, le reste tel quel. */
function auditable(data: Record<string, unknown>): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : (v as string | number | boolean | null)]),
  );
}

/**
 * Crée ou modifie un code.
 *
 * Le **code lui-même** ne change plus après création : les commandes et les
 * utilisations le référencent par son texte, et le renommer rendrait leur
 * historique illisible. Pour changer de code, on en crée un autre.
 */
export async function saveDiscount(
  tx: Tx,
  input: DiscountAdminInput,
  actorId: string,
): Promise<{ id: string; created: boolean }> {
  let productId: string | null = null;
  if (input.productSlug) {
    const product = await tx.product.findUnique({
      where: { slug: input.productSlug },
      select: { id: true },
    });
    if (!product) {
      throw new ActionError("NOT_FOUND", "Ce produit est introuvable.", {
        productSlug: "Produit introuvable.",
      });
    }
    productId = product.id;
  }

  const data = {
    type: input.type,
    value: input.type === "FREE_SHIPPING" ? 0 : input.value,
    minOrderCents: input.minOrderCents,
    productId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    maxUses: input.maxUses,
    maxUsesPerCustomer: input.maxUsesPerCustomer,
    active: input.active,
  };

  if (input.id) {
    const existing = await tx.discount.findUnique({
      where: { id: input.id },
      select: { id: true, code: true },
    });
    if (!existing) throw new ActionError("NOT_FOUND", "Ce code promo est introuvable.");
    if (existing.code !== input.code) {
      throw new ActionError(
        "VALIDATION",
        "Le code ne peut plus être modifié : les commandes passées y font référence.",
        { code: "Modification impossible après création." },
      );
    }
    await tx.discount.update({ where: { id: existing.id }, data });
    await tx.auditLog.create({
      data: { actorId, entity: "Discount", entityId: existing.id, action: "update", diff: auditable(data) },
    });
    return { id: existing.id, created: false };
  }

  const taken = await tx.discount.findUnique({ where: { code: input.code }, select: { id: true } });
  if (taken) {
    throw new ActionError("VALIDATION", "Ce code existe déjà.", { code: "Ce code existe déjà." });
  }
  const created = await tx.discount.create({ data: { code: input.code, ...data }, select: { id: true } });
  await tx.auditLog.create({
    data: {
      actorId,
      entity: "Discount",
      entityId: created.id,
      action: "create",
      diff: auditable({ code: input.code, ...data }),
    },
  });
  return { id: created.id, created: true };
}

/**
 * Active ou suspend un code.
 *
 * Pas de suppression : un code utilisé appartient à l'historique des
 * commandes et de leurs remises. Le suspendre suffit à l'arrêter.
 */
export async function setDiscountActive(
  tx: Tx,
  id: string,
  active: boolean,
  actorId: string,
): Promise<void> {
  const { count } = await tx.discount.updateMany({ where: { id }, data: { active } });
  if (count === 0) throw new ActionError("NOT_FOUND", "Ce code promo est introuvable.");
  await tx.auditLog.create({
    data: { actorId, entity: "Discount", entityId: id, action: active ? "activate" : "deactivate" },
  });
}
