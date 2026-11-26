import { z } from "zod";
import { CARRIERS } from "../shipping";

/**
 * Formulaire d'une tranche de la grille de port (HEP-70).
 *
 * Même règle que les codes promo : tout arrive en texte et repart en unités de
 * stockage — grammes et centimes.
 */

function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".").replace(/\s/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Au-delà, ce n'est plus un colis de cosmétiques mais une faute de frappe. */
const MAX_WEIGHT_GRAMS = 30_000;

export const shippingRateFormSchema = z
  .object({
    id: z
      .string()
      .optional()
      .transform((v) => (v?.trim() ? v.trim() : null)),
    carrier: z.enum(CARRIERS, { error: "Transporteur inconnu." }),
    method: z.enum(["HOME", "PICKUP_POINT"], { error: "Mode de livraison inconnu." }),
    maxWeight: z.string().optional().default(""),
    price: z.string().optional().default(""),
    freeAbove: z.string().optional().default(""),
    active: z.boolean().default(true),
  })
  .transform((input, ctx) => {
    const issue = (path: string, message: string) => {
      ctx.addIssue({ code: "custom", path: [path], message });
      return z.NEVER;
    };

    const grams = parseNumber(input.maxWeight);
    if (grams === null || !Number.isInteger(grams) || grams < 1 || grams > MAX_WEIGHT_GRAMS) {
      return issue("maxWeight", `Poids en grammes, entier, entre 1 et ${MAX_WEIGHT_GRAMS}.`);
    }

    const euros = parseNumber(input.price);
    if (euros === null || euros < 0 || euros > 200) {
      return issue("price", "Prix en euros, entre 0 et 200.");
    }

    let freeAboveCents: number | null = null;
    if (input.freeAbove.trim() !== "") {
      const threshold = parseNumber(input.freeAbove);
      if (threshold === null || threshold <= 0 || threshold > 10_000) {
        return issue("freeAbove", "Montant en euros. Vide = jamais offerte.");
      }
      freeAboveCents = Math.round(threshold * 100);
    }

    return {
      id: input.id,
      carrier: input.carrier,
      method: input.method,
      maxWeightGrams: grams,
      priceCents: Math.round(euros * 100),
      freeAboveCents,
      active: input.active,
    };
  });

export const shippingRateDeleteSchema = z.object({ id: z.string().min(1) });
