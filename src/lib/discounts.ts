import { formatPriceCompact } from "./format";

/**
 * Codes promo — la partie partagée avec le navigateur (HEP-75).
 *
 * Rien ici ne décide si un code est valable : c'est le travail du serveur
 * (`src/server/services/discounts.ts`). Ce module ne fait que normaliser une
 * saisie et traduire un motif de refus en phrase, pour que le panier affiche
 * le même message qu'il ait été calculé côté serveur ou recalculé côté client
 * pendant une mise à jour optimiste.
 */

/**
 * Forme canonique d'un code : majuscules, sans espace.
 *
 * « bienvenue10 », « BIENVENUE 10 » et « Bienvenue10 » désignent le même code.
 * Le refuser parce que le client l'a tapé en minuscules serait le premier
 * message du service client.
 */
export function normalizeDiscountCode(raw: string): string {
  return raw.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

/** Ce qu'un code accepté peut contenir : lettres, chiffres et tiret. */
export const DISCOUNT_CODE_PATTERN = /^[A-Z0-9-]{3,30}$/;

/**
 * Pourquoi un code est refusé.
 *
 * Chaque motif a son message : « expiré », « déjà utilisé », « minimum non
 * atteint » et « non applicable » n'appellent pas la même réaction du client,
 * et un « code invalide » unique le laisserait deviner laquelle.
 */
export type DiscountRefusal =
  /** Inconnu, ou désactivé par la boutique. Volontairement indiscernables. */
  | "UNKNOWN"
  /** La date de début n'est pas encore passée. */
  | "NOT_STARTED"
  /** La date de fin est passée. */
  | "EXPIRED"
  /** Le nombre total d'utilisations prévu est atteint. */
  | "EXHAUSTED"
  /** Ce client a déjà utilisé ce code autant de fois qu'il le pouvait. */
  | "ALREADY_USED"
  /** Le panier n'atteint pas le montant minimum. */
  | "BELOW_MINIMUM"
  /** Code ciblé sur un produit absent du panier, ou panier vide. */
  | "NOT_APPLICABLE";

export function discountRefusalMessage(
  reason: DiscountRefusal,
  context: { minOrderCents?: number | null } = {},
): string {
  switch (reason) {
    case "UNKNOWN":
      return "Ce code promo n'existe pas. Vérifiez l'orthographe.";
    case "NOT_STARTED":
      return "Ce code promo n'est pas encore valable.";
    case "EXPIRED":
      return "Ce code promo a expiré.";
    case "EXHAUSTED":
      return "Ce code promo a déjà été utilisé le nombre de fois prévu.";
    case "ALREADY_USED":
      return "Vous avez déjà utilisé ce code promo.";
    case "BELOW_MINIMUM":
      return context.minOrderCents
        ? `Ce code s'applique dès ${formatPriceCompact(context.minOrderCents)} d'achat.`
        : "Le montant minimum de commande pour ce code n'est pas atteint.";
    case "NOT_APPLICABLE":
      return "Ce code ne s'applique à aucun article de votre panier.";
  }
}

/** Libellé court d'une remise, pour le récapitulatif : « −10 % », « −5 € ». */
export function discountLabel(discount: {
  type: "FIXED" | "PERCENT" | "FREE_SHIPPING";
  value: number;
}): string {
  switch (discount.type) {
    case "FIXED":
      return `−${formatPriceCompact(discount.value)}`;
    case "PERCENT":
      return `−${String(discount.value / 100).replace(".", ",")} %`;
    case "FREE_SHIPPING":
      return "Livraison offerte";
  }
}
