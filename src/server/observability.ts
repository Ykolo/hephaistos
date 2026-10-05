import * as Sentry from "@sentry/nextjs";

/**
 * Capture d'erreur serveur (HEP-38).
 *
 * Deux niveaux, parce qu'une alerte noyée dans le bruit n'est pas une alerte :
 *
 * - `captureError` — le flux ordinaire. Tout bug y va ; on le consulte.
 * - `captureCritical` — ce qui coûte de l'argent ou bloque des clients sans
 *   que personne ne le voie. Étiqueté `alert:<canal>` et en niveau `fatal`,
 *   pour qu'une règle d'alerte Sentry dédiée l'envoie par SMS, hors du canal
 *   des erreurs courantes. Réglage de la règle : `docs/OBSERVABILITE.md`.
 */

export type CriticalChannel =
  /** Le client est débité, la commande n'existe pas (HEP-59). */
  | "stripe-webhook"
  /** Un cron a échoué : historique du stock, sauvegardes. */
  | "cron"
  /** Un email transactionnel n'est pas parti (HEP-66). */
  | "email";

export function captureError(error: unknown, tags: Record<string, string> = {}): void {
  console.error(tags, error);
  Sentry.captureException(error, { tags });
}

export function captureCritical(
  channel: CriticalChannel,
  error: unknown,
  tags: Record<string, string> = {},
): void {
  console.error(`[critique:${channel}]`, tags, error);
  Sentry.captureException(error, {
    level: "fatal",
    tags: { ...tags, alert: channel },
  });
}
