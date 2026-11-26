import { headers } from "next/headers";
import { auth, type AuthSession } from "./auth";
import { ActionError } from "./errors";

/**
 * Gardes d'accès (HEP-62). Le **seul** endroit où le code décide qui a le
 * droit de faire quoi.
 *
 * Elles lèvent une `ActionError` : dans une Server Action enveloppée par
 * `action()`, elle devient une réponse `UNAUTHENTICATED` / `FORBIDDEN`
 * propre. Les variantes de page (redirection vers la connexion) arrivent
 * avec HEP-78, qui remplacera aussi le verrou provisoire `admin-guard.ts`.
 */

/** Session de la requête courante, ou `null`. */
export async function getSession(): Promise<AuthSession | null> {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * Règle admin, séparée de la lecture de session pour être testée seule.
 *
 * Un admin se reconnaît à son **rôle**, jamais à la simple présence d'une
 * session : tout client connecté en a une.
 *
 * Et il doit avoir activé le TOTP. Avec le plugin `twoFactor`, un compte qui
 * l'a activé n'obtient sa session qu'après avoir donné son code ; exiger
 * `twoFactorEnabled` revient donc à exiger que le second facteur ait été
 * vérifié à la connexion.
 */
export function assertAdmin(session: AuthSession | null): AuthSession {
  if (!session) {
    throw new ActionError("UNAUTHENTICATED", "Connectez-vous pour continuer.");
  }
  if (session.user.role !== "admin") {
    throw new ActionError("FORBIDDEN", "Accès réservé à l'administration.");
  }
  if (!session.user.twoFactorEnabled) {
    throw new ActionError(
      "FORBIDDEN",
      "La double authentification est obligatoire pour l'administration.",
    );
  }
  return session;
}

/** Utilisateur connecté, quel que soit son rôle. */
export function assertUser(session: AuthSession | null): AuthSession {
  if (!session) {
    throw new ActionError("UNAUTHENTICATED", "Connectez-vous pour continuer.");
  }
  return session;
}

export async function requireUser(): Promise<AuthSession> {
  return assertUser(await getSession());
}

export async function requireAdmin(): Promise<AuthSession> {
  return assertAdmin(await getSession());
}
