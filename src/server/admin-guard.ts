import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth, type AuthSession } from "./auth";
import { db } from "./db";
import { ActionError } from "./errors";

/**
 * Garde de l'administration (HEP-78). Remplace le verrou provisoire de
 * HEP-39, qui fermait `/admin` partout sauf en local.
 *
 * Trois couches, et aucune ne suffit seule :
 *
 * 1. `src/proxy.ts` — à **chaque** requête `/admin`, y compris les
 *    navigations côté client, qui ne refont pas le rendu du layout.
 * 2. `requireAdminPage()` dans le layout — si le proxy est mal configuré
 *    (matcher modifié, route oubliée), la page refuse quand même.
 * 3. `requireAdminAction()` en tête de **chaque** Server Action — une action
 *    est un point d'entrée HTTP à part entière, appelable sans afficher la
 *    page.
 *
 * Toutes trois appliquent la même règle : `evaluateAdminAccess`.
 */

/** Durée de vie absolue d'une session admin, quelle que soit l'activité. */
export const ADMIN_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
/** Sans requête d'administration pendant ce délai, la session est coupée. */
export const ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/** On n'écrit pas l'activité en base plus d'une fois par minute. */
const ACTIVITY_WRITE_EVERY_MS = 60 * 1000;

export const ADMIN_LOGIN_PATH = "/admin/connexion";
export const ADMIN_2FA_SETUP_PATH = "/admin/securite";

/**
 * Pourquoi l'accès est refusé. Le visiteur n'en voit jamais le détail :
 * `not-admin` donne un 404, comme une URL qui n'existe pas.
 */
export type AdminDenial = "no-session" | "not-admin" | "no-2fa" | "expired" | "idle";

export type AdminAccess =
  | { ok: true; session: AuthSession }
  | { ok: false; reason: AdminDenial; session: AuthSession | null };

/**
 * La règle, sans effet de bord — testée telle quelle.
 *
 * `allowWithout2fa` ne sert qu'à l'écran d'activation du TOTP : un admin
 * fraîchement nommé doit pouvoir l'atteindre pour activer son second facteur.
 */
export function evaluateAdminAccess(
  session: AuthSession | null,
  now: number = Date.now(),
  { allowWithout2fa = false }: { allowWithout2fa?: boolean } = {},
): AdminAccess {
  if (!session) return { ok: false, reason: "no-session", session };
  // Le rôle d'abord : un client ne doit rien apprendre de plus sur l'admin,
  // pas même qu'elle exige un second facteur.
  if (session.user.role !== "admin") return { ok: false, reason: "not-admin", session };

  const createdAt = new Date(session.session.createdAt).getTime();
  if (now - createdAt > ADMIN_SESSION_MAX_AGE_MS) {
    return { ok: false, reason: "expired", session };
  }
  const lastActive = session.session.lastActiveAt
    ? new Date(session.session.lastActiveAt).getTime()
    : createdAt;
  if (now - lastActive > ADMIN_IDLE_TIMEOUT_MS) {
    return { ok: false, reason: "idle", session };
  }

  if (!session.user.twoFactorEnabled && !allowWithout2fa) {
    return { ok: false, reason: "no-2fa", session };
  }
  return { ok: true, session };
}

/**
 * Lit la session, applique la règle, puis en tire les conséquences en base :
 * une session expirée ou inactive est **supprimée** (pas seulement refusée),
 * une session valide voit son activité mise à jour.
 */
export async function checkAdminAccess(
  requestHeaders: Headers,
  options: { allowWithout2fa?: boolean } = {},
): Promise<AdminAccess> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  const now = Date.now();
  const access = evaluateAdminAccess(session, now, options);

  if (!access.ok && (access.reason === "expired" || access.reason === "idle")) {
    await db.session.deleteMany({ where: { id: session!.session.id } });
  }

  if (access.ok) {
    const last = session!.session.lastActiveAt
      ? new Date(session!.session.lastActiveAt).getTime()
      : 0;
    if (now - last > ACTIVITY_WRITE_EVERY_MS) {
      await db.session.updateMany({
        where: { id: session!.session.id },
        data: { lastActiveAt: new Date(now) },
      });
    }
  }
  return access;
}

/** Où envoyer un visiteur refusé, ou `null` pour un 404. */
export function denialRedirect(reason: AdminDenial, next?: string): string | null {
  switch (reason) {
    case "not-admin":
      return null;
    case "no-2fa":
      return ADMIN_2FA_SETUP_PATH;
    case "no-session":
    case "expired":
    case "idle": {
      const params = new URLSearchParams();
      if (reason !== "no-session") params.set("raison", reason === "idle" ? "inactivite" : "expiree");
      if (next && isSafeAdminPath(next)) params.set("suite", next);
      const query = params.toString();
      return query ? `${ADMIN_LOGIN_PATH}?${query}` : ADMIN_LOGIN_PATH;
    }
  }
}

/**
 * Retour après connexion : uniquement vers une page d'administration. Sans ce
 * contrôle, `?suite=https://site-pirate.example` ferait de la page de
 * connexion un relais de phishing.
 */
export function isSafeAdminPath(path: string): boolean {
  return /^\/admin(\/[\w\-./]*)?(\?[^\s]*)?$/.test(path) && !path.startsWith("//");
}

/** En tête du layout d'administration. */
export async function requireAdminPage(): Promise<AuthSession> {
  const access = await checkAdminAccess(await headers());
  if (access.ok) return access.session;
  const target = denialRedirect(access.reason);
  if (!target) notFound();
  redirect(target);
}

/**
 * En tête de **chaque** Server Action d'administration. Renvoie l'auteur à
 * inscrire dans `AuditLog` et `StockMovement`.
 */
export async function requireAdminAction(): Promise<{ actorId: string; session: AuthSession }> {
  const access = await checkAdminAccess(await headers());
  if (access.ok) return { actorId: access.session.user.id, session: access.session };

  switch (access.reason) {
    case "no-session":
    case "expired":
    case "idle":
      throw new ActionError("UNAUTHENTICATED", "Session expirée : reconnectez-vous.");
    case "not-admin":
      throw new ActionError("FORBIDDEN", "Accès réservé à l'administration.");
    case "no-2fa":
      throw new ActionError(
        "FORBIDDEN",
        "Activez la double authentification pour utiliser l'administration.",
      );
  }
}

/**
 * Auteur des écritures faites avant HEP-62, quand l'admin n'avait pas de
 * compte. Conservé pour afficher correctement l'historique existant.
 */
export const LEGACY_LOCAL_ACTOR_ID = "local-admin-avant-HEP-62";
