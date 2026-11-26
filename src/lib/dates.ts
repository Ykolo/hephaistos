/**
 * Formatage de dates — un seul endroit, comme pour les montants.
 */
const longDate = new Intl.DateTimeFormat("fr-FR", {
  // Le jour **à Paris** : sur un serveur en UTC, minuit à Paris tombe encore
  // la veille, et « valable dès le 1ᵉʳ » s'afficherait « dès le 30 ».
  timeZone: "Europe/Paris",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const PARIS = "Europe/Paris";

/** Décalage de Paris par rapport à UTC à un instant donné, en millisecondes. */
function parisOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PARIS,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * `2026-12-01` → l'instant où commence le 1ᵉʳ décembre **à Paris**.
 *
 * Une date saisie dans l'admin est une date française : « valable jusqu'au
 * 31 » s'entend à minuit à Paris, pas à minuit UTC — une heure plus tôt en
 * hiver, deux en été. Les changements d'heure ont lieu à 2 h ou 3 h du matin,
 * jamais à minuit : le décalage lu à minuit UTC est donc celui de la journée.
 */
export function parisDayStart(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  return new Date(utcMidnight.getTime() - parisOffsetMs(utcMidnight));
}

/** Instant → `AAAA-MM-JJ` du jour correspondant à Paris (valeur d'un `<input type="date">`). */
export function toParisIsoDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PARIS }).format(date);
}

/** `2026-11-15` → « 15 novembre 2026 ». */
export function formatLongDate(date: Date): string {
  return longDate.format(date);
}

/**
 * Phrase d'expédition d'une précommande, telle qu'elle doit apparaître
 * **avant** le paiement (HEP-42).
 *
 * L'encaissement est immédiat : cette mention est l'engagement pris envers le
 * client, pas une information secondaire. Elle doit être lisible sur la fiche,
 * dans le panier et dans le récapitulatif — jamais seulement après l'achat.
 */
export function preorderNotice(shipsAt: Date | null): string {
  if (!shipsAt) {
    // Ne devrait pas arriver : la date est obligatoire dès qu'un produit
    // passe en précommande. Message prudent plutôt qu'une promesse inventée.
    return "Précommande — date d'expédition à confirmer.";
  }
  return `Précommande — expédition prévue le ${formatLongDate(shipsAt)}.`;
}
