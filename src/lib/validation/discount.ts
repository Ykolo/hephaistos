import { z } from "zod";
import { DISCOUNT_CODE_PATTERN, normalizeDiscountCode } from "../discounts";
import { parisDayStart } from "../dates";

/**
 * Formulaire d'un code promo en administration (HEP-75).
 *
 * Tout arrive en texte (`FormData`) et repart en unités de stockage : centimes
 * pour les montants, points de base pour les pourcentages, instants pour les
 * dates. La conversion se fait ici, une fois, à la frontière.
 */

function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".").replace(/\s/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : null));

const isoDate = optionalText.refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), {
  error: "Date invalide.",
});

export const discountFormSchema = z
  .object({
    id: optionalText,
    code: z
      .string({ error: "Le code est requis." })
      .transform(normalizeDiscountCode)
      .refine((c) => DISCOUNT_CODE_PATTERN.test(c), {
        error: "3 à 30 caractères : lettres, chiffres et tiret.",
      }),
    type: z.enum(["FIXED", "PERCENT", "FREE_SHIPPING"], { error: "Type de remise inconnu." }),
    /** Euros pour FIXED, pourcentage pour PERCENT, ignoré pour FREE_SHIPPING. */
    value: z.string().optional().default(""),
    minOrder: optionalText,
    productSlug: optionalText,
    startsOn: isoDate,
    endsOn: isoDate,
    maxUses: optionalText,
    maxUsesPerCustomer: z.string().optional().default("1"),
    active: z.boolean().default(true),
  })
  .transform((input, ctx) => {
    const issue = (path: string, message: string) => {
      ctx.addIssue({ code: "custom", path: [path], message });
      return z.NEVER;
    };

    let value = 0;
    if (input.type === "FIXED") {
      const euros = parseNumber(input.value);
      if (euros === null || euros <= 0) return issue("value", "Montant en euros supérieur à zéro.");
      if (euros > 10_000) return issue("value", "Ce montant semble erroné.");
      value = Math.round(euros * 100);
    } else if (input.type === "PERCENT") {
      const pct = parseNumber(input.value);
      if (pct === null || pct <= 0 || pct > 100) return issue("value", "Pourcentage entre 0 et 100.");
      // Points de base : 12,5 % → 1250. Au-delà de deux décimales, c'est une
      // faute de frappe, pas une politique commerciale.
      value = Math.round(pct * 100);
    }

    let minOrderCents: number | null = null;
    if (input.minOrder !== null) {
      const euros = parseNumber(input.minOrder);
      if (euros === null || euros < 0) return issue("minOrder", "Montant en euros.");
      minOrderCents = euros === 0 ? null : Math.round(euros * 100);
    }

    let maxUses: number | null = null;
    if (input.maxUses !== null) {
      const n = parseNumber(input.maxUses);
      if (n === null || !Number.isInteger(n) || n < 1) {
        return issue("maxUses", "Nombre entier, au moins 1. Vide = illimité.");
      }
      maxUses = n;
    }

    const perCustomer = parseNumber(input.maxUsesPerCustomer || "1");
    if (perCustomer === null || !Number.isInteger(perCustomer) || perCustomer < 1) {
      return issue("maxUsesPerCustomer", "Nombre entier, au moins 1.");
    }

    // La fin est **exclusive** et posée au lendemain : « jusqu'au 31 inclus »
    // veut dire que le code vaut encore à 23 h 59 le 31, heure de Paris.
    const startsAt = input.startsOn ? parisDayStart(input.startsOn) : null;
    const endsAt = input.endsOn
      ? new Date(parisDayStart(input.endsOn).getTime() + 24 * 60 * 60 * 1000)
      : null;
    if (startsAt && endsAt && endsAt <= startsAt) {
      return issue("endsOn", "La fin doit être après le début.");
    }

    return {
      id: input.id,
      code: input.code,
      type: input.type,
      value,
      minOrderCents,
      productSlug: input.productSlug,
      startsAt,
      endsAt,
      maxUses,
      maxUsesPerCustomer: perCustomer,
      active: input.active,
    };
  });

export type DiscountFormInput = z.output<typeof discountFormSchema>;

export const discountToggleSchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});
