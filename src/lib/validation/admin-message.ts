import { z } from "zod";

/**
 * Boîte de réception de l'admin (HEP-89).
 *
 * Même partage que pour les commandes : la recherche vient de l'URL et un
 * paramètre invalide y est ignoré ; l'action écrit en base et refuse.
 */

export const MESSAGE_STATUSES = ["NEW", "READ", "ANSWERED", "ARCHIVED", "SPAM"] as const;

/** Identifiants d'URL, en français : ils finissent dans un favori. */
export const MESSAGE_STATUS_SLUGS = {
  nouveaux: "NEW",
  lus: "READ",
  repondus: "ANSWERED",
  archives: "ARCHIVED",
  spam: "SPAM",
} as const satisfies Record<string, (typeof MESSAGE_STATUSES)[number]>;

export type MessageStatusSlug = keyof typeof MESSAGE_STATUS_SLUGS;

export const messageSearchSchema = z.object({
  etat: z.enum(Object.keys(MESSAGE_STATUS_SLUGS) as [MessageStatusSlug, ...MessageStatusSlug[]]).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
  id: z.string().uuid().optional().catch(undefined),
});

export const messageStatusSchema = z.object({
  id: z.string().uuid({ error: "Message introuvable." }),
  status: z.enum(MESSAGE_STATUSES, { error: "État inconnu." }),
});
