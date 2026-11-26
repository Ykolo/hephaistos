/**
 * Erreurs de Better Auth traduites — jamais le texte anglais brut, et jamais
 * un message qui dirait si une adresse a un compte (HEP-63).
 *
 * Partagé entre le site et l'administration : un même code d'erreur se lit
 * pareil des deux côtés.
 */
export function authErrorMessage(
  error: { code?: string; status?: number } | null | undefined,
  fallback = "Une erreur est survenue. Réessayez.",
): string {
  if (!error) return fallback;
  if (error.status === 429) return "Trop de tentatives. Réessayez dans quelques minutes.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Email ou mot de passe incorrect.";
    case "EMAIL_NOT_VERIFIED":
      return "Adresse non confirmée : un nouveau lien vient de vous être envoyé.";
    case "INVALID_EMAIL":
      return "Adresse email invalide.";
    case "PASSWORD_TOO_SHORT":
      return "Le mot de passe doit faire au moins 12 caractères.";
    case "PASSWORD_TOO_LONG":
      return "Le mot de passe ne peut pas dépasser 128 caractères.";
    case "INVALID_TOKEN":
      return "Ce lien n'est plus valable : il a expiré ou a déjà servi.";
    case "INVALID_CODE":
    case "INVALID_TWO_FACTOR_CODE":
      return "Code incorrect.";
    case "INVALID_BACKUP_CODE":
      return "Code de secours incorrect ou déjà utilisé.";
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
    case "ACCOUNT_LOCKED":
      return "Trop d'essais : le compte est temporairement verrouillé.";
    default:
      return fallback;
  }
}

/**
 * Chemin de retour après connexion : une page du site, jamais une autre
 * origine (`//pirate.example` est une URL absolue pour le navigateur).
 */
export function safeReturnPath(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (!/^\/[\w\-./?=&%]*$/.test(value)) return fallback;
  return value;
}
