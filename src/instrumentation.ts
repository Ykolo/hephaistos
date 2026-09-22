import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@/lib/sentry-scrub";

/**
 * Démarrage de Sentry côté serveur (HEP-38), pour les deux environnements
 * d'exécution de Next : Node (pages, Server Actions, routes) et Edge.
 */
export function register() {
  Sentry.init(sharedSentryOptions);
}

/**
 * Erreurs de rendu serveur et de Route Handlers non rattrapées : Next les
 * remonte ici, où qu'elles surviennent.
 */
export const onRequestError = Sentry.captureRequestError;
