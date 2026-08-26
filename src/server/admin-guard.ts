import { notFound } from "next/navigation";
import { ActionError } from "./errors";

/**
 * Verrou provisoire de l'administration.
 *
 * ⚠️ **Il n'y a pas encore d'authentification.** Better Auth arrive en HEP-62,
 * la garde d'accès et la 2FA en HEP-78. En attendant, `/admin` laisse modifier
 * les prix, le stock et le statut de publication : le livrer accessible
 * reviendrait à publier un back-office ouvert.
 *
 * Ce module bloque donc l'administration partout sauf en développement local,
 * et exige en plus un opt-in explicite. Le jour où HEP-78 est fait, tout ce
 * fichier est remplacé par `requireAdmin()` — et rien d'autre ne bouge, puisque
 * c'est le seul point de passage.
 */

/** Vrai uniquement en local, et seulement si l'opt-in est posé. */
function adminUnlocked(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ADMIN_UNSAFE_LOCAL === "1"
  );
}

/**
 * À appeler en tête de **chaque** page d'administration.
 *
 * Renvoie un 404 plutôt qu'un 403 : un 403 confirmerait à un visiteur non
 * autorisé que l'URL existe et vaut la peine d'être creusée.
 */
export function guardAdminPage(): void {
  if (!adminUnlocked()) notFound();
}

/**
 * À appeler en tête de **chaque** Server Action d'administration.
 *
 * La garde de page ne suffit pas : une Server Action est un point d'entrée
 * réseau à part entière, appelable directement sans jamais afficher la page.
 */
export function guardAdminAction(): void {
  if (!adminUnlocked()) {
    throw new ActionError(
      "FORBIDDEN",
      "L'administration n'est pas encore accessible (HEP-78).",
    );
  }
}

/**
 * Auteur d'une écriture, pour `AuditLog` et `StockMovement`.
 *
 * Tant qu'il n'y a pas de session, toutes les écritures sont attribuées à cet
 * acteur factice — reconnaissable, pour que les traces laissées avant HEP-62
 * ne se confondent pas avec de vraies actions d'administrateur.
 */
export const PROVISIONAL_ACTOR_ID = "local-admin-avant-HEP-62";
