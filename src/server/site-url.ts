/**
 * Origine publique du site, pour les liens absolus des emails (HEP-62, HEP-67).
 *
 * `BETTER_AUTH_URL` d'abord (le domaine définitif), sinon l'URL du
 * déploiement Vercel — une preview change d'adresse à chaque déploiement —,
 * sinon `NEXT_PUBLIC_SITE_URL`. Sans aucune origine, un lien d'email serait
 * relatif, donc inutilisable hors du site : c'est le cas en CI.
 */

export function vercelOrigins(): string[] {
  return [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]
    .filter((host): host is string => Boolean(host))
    .map((host) => `https://${host}`);
}

export function siteOrigin(): string | undefined {
  return process.env.BETTER_AUTH_URL || vercelOrigins()[0] || process.env.NEXT_PUBLIC_SITE_URL;
}

/** Lien absolu ; relatif en dernier recours, plutôt qu'une exception dans un envoi de mail. */
export function absoluteUrl(path: string): string {
  return `${siteOrigin() ?? ""}${path}`;
}
