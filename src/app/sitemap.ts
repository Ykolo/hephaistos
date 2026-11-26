import type { MetadataRoute } from "next";
import { getSitemapSource } from "@/server/catalog";
import { buildSitemap, canonicalOrigin, isIndexable } from "@/lib/seo";

/**
 * `/sitemap.xml`, généré depuis la base (HEP-97).
 *
 * Hors production, il est vide : une preview n'a rien à proposer à un
 * moteur, et `robots.txt` l'y interdit déjà.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isIndexable()) return [];
  const source = await getSitemapSource();
  return buildSitemap({ origin: canonicalOrigin(), ...source });
}
