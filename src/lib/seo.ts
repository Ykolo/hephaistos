import type { MetadataRoute } from "next";
import { routes } from "./routes";

/**
 * Sitemap et robots (HEP-97) — la partie pure, testée sans serveur.
 *
 * Deux règles qui ne se contredisent jamais :
 * - le sitemap ne liste que des pages **publiques et publiées** ;
 * - tout chemin privé est à la fois absent du sitemap et interdit dans
 *   `robots.txt`. Une seule liste, `PRIVATE_PATHS`, sert aux deux.
 */

/**
 * Chemins jamais indexés : comptes, panier, désinscription, pages de
 * confirmation, administration, API. Préfixes : `/compte` couvre aussi ses
 * sous-pages.
 */
export const PRIVATE_PATHS = [
  "/admin",
  "/api/",
  "/compte",
  "/connexion",
  "/inscription",
  "/mot-de-passe-oublie",
  "/reinitialiser",
  "/panier",
  "/commande/",
  "/desinscription",
  "/newsletter/confirmation",
] as const;

export function isPrivatePath(path: string): boolean {
  return PRIVATE_PATHS.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)));
}

/** `process.env`, ou un objet équivalent dans les tests. */
type Env = Record<string, string | undefined>;

/**
 * Origine canonique du site : celle de la **production**, même quand le
 * sitemap est servi par une preview — une URL de sitemap pointe toujours vers
 * le vrai site.
 *
 * `NEXT_PUBLIC_SITE_URL` d'abord, sauf s'il vaut localhost sur Vercel (une
 * valeur de `.env.example` recopiée telle quelle) ; sinon le domaine de
 * production que Vercel connaît.
 */
export function canonicalOrigin(env: Env = process.env): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (explicit && !(env.VERCEL && explicit.includes("localhost"))) return explicit;
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

/**
 * Seule la production s'indexe. Une preview indexée crée du contenu dupliqué
 * qui peut passer devant le vrai site ; le développement local non plus n'a
 * rien à offrir à un robot.
 */
export function isIndexable(env: Env = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

export function buildRobots(env: Env = process.env): MetadataRoute.Robots {
  if (!isIndexable(env)) {
    // Preview et local : tout est fermé, et pas de sitemap à suivre. Doublé
    // par l'en-tête `X-Robots-Tag: noindex` des previews (`vercel.ts`).
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] },
    sitemap: `${canonicalOrigin(env)}/sitemap.xml`,
  };
}

export type SitemapProduct = { slug: string; updatedAt: Date };

/** Pages éditoriales indexables, dans l'ordre d'importance. */
const STATIC_PAGES: { path: string; priority: number }[] = [
  { path: routes.home, priority: 1 },
  { path: routes.shop, priority: 0.9 },
  { path: routes.histoire, priority: 0.6 },
  { path: routes.vision, priority: 0.6 },
  { path: routes.avis, priority: 0.6 },
  { path: routes.newsletter, priority: 0.4 },
  { path: routes.contact, priority: 0.4 },
  { path: routes.legal, priority: 0.2 },
];

function latest(dates: (Date | null | undefined)[]): Date | undefined {
  const valid = dates.filter((d): d is Date => d instanceof Date);
  return valid.length === 0 ? undefined : new Date(Math.max(...valid.map((d) => d.getTime())));
}

/**
 * Le sitemap.
 *
 * `lastModified` vient des données, jamais de la date du build : un sitemap
 * qui annonce chaque page « modifiée aujourd'hui » à chaque déploiement
 * apprend à Google à ignorer ce champ. Une page sans source de date n'en a
 * pas.
 */
export function buildSitemap(input: {
  origin: string;
  products: readonly SitemapProduct[];
  /** Dernière modification des textes légaux (réglages entreprise, contenus éditables). */
  legalUpdatedAt?: Date | null;
}): MetadataRoute.Sitemap {
  const catalogUpdatedAt = latest(input.products.map((p) => p.updatedAt));
  const pages: MetadataRoute.Sitemap = STATIC_PAGES.map(({ path, priority }) => {
    const lastModified =
      path === routes.home || path === routes.shop
        ? catalogUpdatedAt
        : path === routes.legal
          ? latest([input.legalUpdatedAt])
          : undefined;
    return {
      url: `${input.origin}${path === "/" ? "" : path}`,
      ...(lastModified ? { lastModified } : {}),
      priority,
    };
  });

  const products: MetadataRoute.Sitemap = input.products.map((p) => ({
    url: `${input.origin}${routes.product(p.slug)}`,
    lastModified: p.updatedAt,
    priority: 0.8,
  }));

  return [...pages, ...products].filter((entry) => !isPrivatePath(new URL(entry.url).pathname));
}
