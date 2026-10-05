import * as Sentry from "@sentry/nextjs";
import { initBotId } from "botid/client/core";
import { sharedSentryOptions } from "@/lib/sentry-scrub";

/**
 * Pages dont les formulaires sont protégés par Vercel BotID (HEP-35).
 *
 * Une Server Action est un `POST` sur l'URL de la page qui la déclenche : c'est
 * donc la **page** qui figure ici, pas l'action. Toute action déclarée avec
 * `botProtection: true` doit avoir sa page dans cette liste — sinon le jeton
 * n'est pas envoyé et `checkBotId()` prend chaque visiteur pour un robot.
 *
 * À compléter au fil des lots : newsletter (HEP-67), avis (HEP-90),
 * inscription (HEP-63).
 */
initBotId({
  protect: [{ path: "/contact", method: "POST" }],
});

/**
 * Sentry côté navigateur (HEP-38). Pas de Session Replay : il enregistrerait
 * les saisies du tunnel d'achat, adresses comprises.
 */
Sentry.init(sharedSentryOptions);

/** Trace les navigations côté client (changements de page sans rechargement). */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
