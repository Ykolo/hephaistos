import type { Tx } from "../db";
import { LEGACY_LOCAL_ACTOR_ID } from "../admin-guard";

/**
 * Libellé lisible de l'auteur d'une écriture (journal de commande,
 * `AuditLog`). `actorId` est une chaîne libre : soit un id de compte, soit
 * un acteur système préfixé par `@`.
 */

const SYSTEM_ACTORS: Record<string, string> = {
  "@stripe": "Stripe",
  "@client": "Client",
  "@systeme": "Automatique",
  [LEGACY_LOCAL_ACTOR_ID]: "Admin (local, avant les comptes)",
};

/** Noms des comptes cités, en une requête. */
export async function loadActorNames(
  db: Tx,
  actorIds: Iterable<string | null>,
): Promise<Map<string, string>> {
  const ids = [...new Set([...actorIds].filter((id): id is string => !!id && !(id in SYSTEM_ACTORS)))];
  if (ids.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u.name ? `${u.name} (${u.email})` : u.email]));
}

export function actorLabel(actorId: string | null, names: Map<string, string>): string {
  if (!actorId) return "—";
  // Compte supprimé depuis : l'id reste, c'est la trace qui compte.
  return SYSTEM_ACTORS[actorId] ?? names.get(actorId) ?? `Compte supprimé (${actorId.slice(0, 8)})`;
}
