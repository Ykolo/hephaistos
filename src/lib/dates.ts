/**
 * Formatage de dates — un seul endroit, comme pour les montants.
 */
const longDate = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

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
