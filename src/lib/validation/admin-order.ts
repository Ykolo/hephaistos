import { z } from "zod";

/**
 * Administration des commandes (HEP-56).
 *
 * Deux familles de schémas, qui ne se traitent pas pareil :
 *
 *   - la **recherche** vient de l'URL. Une URL se colle, se tronque, se
 *     bricole : un paramètre invalide y est **ignoré** (`.catch`) plutôt que
 *     de transformer la liste des commandes en page d'erreur ;
 *   - les **actions** écrivent en base. Là, une entrée invalide est refusée,
 *     comme partout ailleurs.
 */

export const ORDER_STATUSES = [
  "PENDING",
  "PAID",
  "PREPARING",
  "SHIPPED",
  "DELIVERED",
  "CANCELED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;

/**
 * Raccourcis de la barre de filtres. Les identifiants finissent dans l'URL :
 * ils sont en français, lisibles dans un favori.
 */
export const QUICK_FILTERS = [
  "a-expedier",
  "attente-paiement",
  "precommandes",
  "du-jour",
] as const;

export type QuickFilter = (typeof QUICK_FILTERS)[number];

/** `AAAA-MM-JJ`, ce qu'envoie un `<input type="date">`. */
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const orderSearchSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  status: z.enum(ORDER_STATUSES).optional().catch(undefined),
  quick: z.enum(QUICK_FILTERS).optional().catch(undefined),
  from: isoDay.optional().catch(undefined),
  to: isoDay.optional().catch(undefined),
  sort: z.enum(["asc", "desc"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

export type OrderSearch = z.output<typeof orderSearchSchema>;

/**
 * États qu'un administrateur peut poser **à la main**.
 *
 * Le reste a son propre chemin, et ce n'est pas un détail :
 *   - `PAID` ne vient que du webhook Stripe (HEP-59) — marquer payée une
 *     commande que Stripe n'a pas encaissée, c'est expédier gratuitement ;
 *   - `CANCELED` passe par l'annulation, qui rend le stock et l'argent ;
 *   - `REFUNDED` et `PARTIALLY_REFUNDED` passent par le remboursement (HEP-60).
 */
export const ADMIN_SETTABLE_STATUSES = ["PREPARING", "SHIPPED", "DELIVERED"] as const;

const orderId = z.uuid({ error: "Commande invalide." });

export const changeOrderStatusSchema = z.object({
  orderId,
  to: z.enum(ADMIN_SETTABLE_STATUSES, { error: "Cet état ne se pose pas à la main." }),
  /** Numéro de suivi, motif — ce qui rend le journal lisible. */
  note: z
    .string()
    .trim()
    .max(500, { error: "La note ne peut pas dépasser 500 caractères." })
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export const orderNoteSchema = z.object({
  orderId,
  /** Vide = note effacée. */
  note: z
    .string()
    .max(2000, { error: "La note ne peut pas dépasser 2000 caractères." }),
});

export const cancelOrderSchema = z.object({
  orderId,
  reason: z
    .string({ error: "Indiquez la raison de l'annulation." })
    .trim()
    .min(3, { error: "Indiquez la raison de l'annulation." })
    .max(500, { error: "Le motif ne peut pas dépasser 500 caractères." }),
});
