import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

/**
 * Nettoyage des événements Sentry avant envoi (HEP-38).
 *
 * Sentry est un sous-traitant situé hors de notre base : rien de ce qui
 * identifie un client ne doit y partir — ni email, ni adresse postale, ni
 * téléphone, ni token (panier, confirmation newsletter, réinitialisation de
 * mot de passe). `sendDefaultPii: false` couvre l'IP et les cookies ; ce
 * module couvre ce que l'application glisse elle-même dans les messages
 * d'erreur et les contextes.
 *
 * Partagé entre le serveur et le navigateur : aucune dépendance Node.
 */

const FILTERED = "[filtré]";

/** Clés dont la valeur est toujours masquée, quel que soit leur contenu. */
const SENSITIVE_KEY =
  /(e-?mail|password|passwd|secret|token|authorization|cookie|phone|telephone|address|adresse|street|postal|zip|iban|card|firstname|lastname)$/i;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Téléphones français, avec ou sans indicatif et séparateurs.
const PHONE_FR = /(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g;
// Longues suites aléatoires : tokens de panier, de confirmation, JWT.
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;

export function scrubString(value: string): string {
  return value
    .replace(EMAIL, FILTERED)
    .replace(PHONE_FR, FILTERED)
    .replace(LONG_TOKEN, FILTERED);
}

/** Parcourt récursivement une valeur et masque ce qui doit l'être. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return FILTERED; // structure anormalement profonde
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? FILTERED : scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  // L'utilisateur Sentry ne garde qu'un identifiant technique, jamais de
  // coordonnées.
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;

  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.headers) {
      event.request.headers = scrubValue(event.request.headers) as Record<string, string>;
    }
    // Les liens de confirmation et de désinscription portent leur token en
    // paramètre de requête.
    if (event.request.query_string) event.request.query_string = FILTERED;
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
  }

  if (event.message) event.message = scrubString(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubString(exception.value);
  }
  if (event.extra) event.extra = scrubValue(event.extra) as ErrorEvent["extra"];
  if (event.contexts) {
    // Le contexte `trace` est laissé intact : ses identifiants font 32
    // caractères et seraient pris pour des tokens, ce qui casserait le lien
    // entre une erreur et sa trace.
    const { trace, ...rest } = event.contexts;
    event.contexts = { ...(scrubValue(rest) as ErrorEvent["contexts"]), trace };
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);

  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  return {
    ...breadcrumb,
    message: breadcrumb.message ? scrubString(breadcrumb.message) : breadcrumb.message,
    data: breadcrumb.data ? (scrubValue(breadcrumb.data) as Breadcrumb["data"]) : undefined,
  };
}

/** Options communes aux trois environnements d'exécution (Node, Edge, navigateur). */
export const sharedSentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Sans DSN (local, CI), le SDK est chargé mais n'envoie rien.
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  sendDefaultPii: false,
  // Échantillonnage des traces de performance : 10 % suffisent à voir une
  // tendance sans épuiser le quota gratuit. Les erreurs, elles, sont toutes
  // envoyées.
  tracesSampleRate: 0.1,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
};
