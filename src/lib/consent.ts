/**
 * Consentement aux cookies (HEP-93) — partie pure, partagée par la bannière,
 * le serveur et la politique de cookies.
 *
 * Règle de fond (CNIL, lignes directrices du 17 septembre 2020) : **aucun
 * traceur non essentiel avant un clic explicite**. Fermer la bannière,
 * continuer à naviguer ou ne rien faire valent refus.
 */

export const CONSENT_COOKIE = "hf_consent";

/**
 * Version de la bannière. À incrémenter quand les finalités ou la liste des
 * traceurs changent : un choix fait sur une ancienne version n'est plus
 * éclairé, la bannière se réaffiche.
 */
export const CONSENT_VERSION = 1;

/** 6 mois, durée de conservation du choix recommandée par la CNIL. */
export const CONSENT_MAX_AGE_SECONDS = 182 * 24 * 60 * 60;

/** Événement émis sur `window` quand le choix change — les chargeurs GA4 / Meta l'écouteront. */
export const CONSENT_EVENT = "hf:consent";

export type ConsentCategory = "analytics" | "marketing";

export type ConsentChoice = { analytics: boolean; marketing: boolean };

export type ConsentAction = "accept_all" | "reject_all" | "custom" | "dismiss";

export type ConsentState = ConsentChoice & { consentId: string; version: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `1.<consentId>.10` : version, identifiant de preuve, mesure d'audience, marketing. */
export function encodeConsent(state: ConsentState): string {
  return `${state.version}.${state.consentId}.${state.analytics ? 1 : 0}${state.marketing ? 1 : 0}`;
}

/** `null` pour une valeur absente, mal formée ou d'une autre version : la bannière se réaffiche. */
export function parseConsent(raw: string | null | undefined): ConsentState | null {
  if (!raw) return null;
  const m = /^(\d+)\.([0-9a-f-]{36})\.([01])([01])$/.exec(decodeURIComponent(raw));
  if (!m || !UUID.test(m[2])) return null;
  const version = Number(m[1]);
  if (version !== CONSENT_VERSION) return null;
  return { version, consentId: m[2], analytics: m[3] === "1", marketing: m[4] === "1" };
}

/** Lecture côté navigateur. Le cookie n'est pas `httpOnly` : les chargeurs de traceurs doivent le lire. */
export function readConsentFromDocument(): ConsentState | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(entry?.slice(CONSENT_COOKIE.length + 1));
}

export const CONSENT_CATEGORIES: {
  key: "necessary" | ConsentCategory;
  label: string;
  description: string;
}[] = [
  {
    key: "necessary",
    label: "Nécessaires",
    description: "Panier, connexion, sécurité, mémorisation de ce choix. Toujours actifs : le site ne fonctionne pas sans.",
  },
  {
    key: "analytics",
    label: "Mesure d'audience",
    description: "Comprendre quelles pages sont lues et où le parcours d'achat bloque (Google Analytics 4).",
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Mesurer l'efficacité de nos publicités et vous en montrer de plus pertinentes (Meta).",
  },
];

/** Liste des traceurs, reprise telle quelle par la politique de cookies. */
export const TRACKERS: {
  name: string;
  category: "necessary" | ConsentCategory;
  purpose: string;
  duration: string;
  provider: string;
}[] = [
  { name: "hep_cart", category: "necessary", purpose: "Retrouver votre panier", duration: "30 jours", provider: "Héphaïstos" },
  { name: "hep.session_token", category: "necessary", purpose: "Vous garder connecté à votre compte", duration: "30 jours", provider: "Héphaïstos" },
  { name: "hep_cart_notice", category: "necessary", purpose: "Afficher une seule fois un message du panier", duration: "1 jour", provider: "Héphaïstos" },
  { name: CONSENT_COOKIE, category: "necessary", purpose: "Mémoriser votre choix sur les cookies", duration: "6 mois", provider: "Héphaïstos" },
  { name: "_ga, _ga_*", category: "analytics", purpose: "Mesure d'audience", duration: "13 mois", provider: "Google (Irlande)" },
  { name: "_fbp, _fbc", category: "marketing", purpose: "Mesure des publicités Meta", duration: "3 mois", provider: "Meta (Irlande)" },
];

export const CATEGORY_LABELS: Record<"necessary" | ConsentCategory, string> = {
  necessary: "Nécessaire",
  analytics: "Mesure d'audience",
  marketing: "Marketing",
};
