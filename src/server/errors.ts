/**
 * Contrat d'erreur unique de toutes les Server Actions (HEP-34).
 *
 * Une seule forme de retour pour toute l'application. Sans cette contrainte,
 * chaque fonctionnalité invente son propre format et le back-office devient
 * impossible à écrire : il faut alors un cas particulier par formulaire.
 */

/**
 * Union **fermée** : jamais de chaîne libre. L'UI décide de son comportement
 * sur le code (proposer un autre produit, réafficher le champ, réessayer…),
 * pas sur le texte du message, qui n'est fait que pour être lu.
 */
export const ERROR_CODES = [
  "VALIDATION", // le schéma Zod a refusé l'entrée — voir `fields`
  "UNAUTHENTICATED", // pas de session
  "FORBIDDEN", // session valide, droits insuffisants
  "NOT_FOUND",
  "OUT_OF_STOCK",
  "PRODUCT_UNAVAILABLE", // brouillon, archivé, ou pas encore en vente
  "CART_EXPIRED",
  "INVALID_DISCOUNT",
  "DISCOUNT_EXPIRED",
  "DISCOUNT_ALREADY_USED",
  "PAYMENT_FAILED",
  "ALREADY_PROCESSED", // rejeu idempotent : ce n'est pas une erreur pour l'UI
  "SHIPPING_UNAVAILABLE",
  "RATE_LIMITED",
  "BOT_DETECTED",
  "INTERNAL", // tout le reste — le détail part chez Sentry, jamais au client
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: ErrorCode;
      message: string;
      /** Erreurs par champ, pour un affichage au bon endroit du formulaire. */
      fields?: Record<string, string>;
    };

/**
 * Erreur métier attendue : elle traverse le helper `action()` et devient une
 * réponse propre. Tout ce qui n'est pas une `ActionError` est un bug, donc
 * un `INTERNAL` doublé d'une capture Sentry.
 */
export class ActionError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

/** Messages par défaut, en français, destinés à être affichés tels quels. */
export const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION: "Certains champs sont incomplets ou invalides.",
  UNAUTHENTICATED: "Vous devez être connecté pour effectuer cette action.",
  FORBIDDEN: "Vous n'avez pas les droits nécessaires.",
  NOT_FOUND: "Cet élément est introuvable.",
  OUT_OF_STOCK: "Ce produit n'est plus disponible en quantité suffisante.",
  PRODUCT_UNAVAILABLE: "Ce produit n'est pas disponible à la vente.",
  CART_EXPIRED: "Votre panier a expiré. Les articles ont été libérés.",
  INVALID_DISCOUNT: "Ce code promo est invalide.",
  DISCOUNT_EXPIRED: "Ce code promo n'est plus valable.",
  DISCOUNT_ALREADY_USED: "Ce code promo a déjà été utilisé.",
  PAYMENT_FAILED: "Le paiement n'a pas abouti.",
  ALREADY_PROCESSED: "Cette opération a déjà été traitée.",
  SHIPPING_UNAVAILABLE: "Aucun mode de livraison ne convient à cette commande.",
  RATE_LIMITED: "Trop de tentatives. Merci de réessayer dans un instant.",
  BOT_DETECTED: "Requête refusée.",
  INTERNAL: "Une erreur est survenue. Merci de réessayer.",
};

export function fail<T = never>(
  code: ErrorCode,
  message?: string,
  fields?: Record<string, string>,
): ActionResult<T> {
  return { ok: false, code, message: message ?? DEFAULT_MESSAGES[code], fields };
}

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}
