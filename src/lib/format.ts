/**
 * Formatage monétaire — un seul endroit dans toute l'application.
 *
 * Les montants circulent en **centimes** (entiers) et ne sont convertis en
 * euros qu'au moment de l'affichage. Un `Intl.NumberFormat` partagé garantit
 * que « 15 € » et « 1 234,50 € » suivent les mêmes règles françaises :
 * virgule décimale, espace insécable avant le symbole.
 */
const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

/** `1500` → « 15,00 € ». */
export function formatPrice(cents: number): string {
  return eur.format(cents / 100);
}

/**
 * Variante compacte : masque les centimes quand ils sont nuls.
 * `1500` → « 15 € », `1550` → « 15,50 € ».
 *
 * C'est la forme utilisée dans les grilles et les cartes produit, où le
 * « ,00 » n'apporte rien et alourdit la ligne.
 */
export function formatPriceCompact(cents: number): string {
  const hasCentimes = cents % 100 !== 0;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: hasCentimes ? 2 : 0,
    maximumFractionDigits: hasCentimes ? 2 : 0,
  }).format(cents / 100);
}

/**
 * Prix au 100 ml, pour la comparaison entre contenants (HEP-39).
 * Retourne `null` si le volume est inconnu, plutôt qu'un prix faux.
 */
export function formatPricePer100ml(
  cents: number,
  volumeMl: number | null,
): string | null {
  if (!volumeMl || volumeMl <= 0) return null;
  return `${formatPrice(Math.round((cents / volumeMl) * 100))} / 100 ml`;
}
