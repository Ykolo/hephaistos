import { cacheLife, cacheTag, updateTag } from "next/cache";
import { db } from "./db";
import {
  findPublishedProductBySlug,
  listPublishedProducts,
  listPublishedSlugs,
} from "./services/catalog";
import type { ProductView } from "@/lib/products";

/**
 * Couche de cache du catalogue public (HEP-45).
 *
 * Sépare volontairement le *quoi* (services purs, testables) du *combien de
 * temps* (ici). Chaque entrée est étiquetée : une écriture en admin appelle
 * `updateTag` sur l'étiquette correspondante et la page publique reflète le
 * changement à la requête suivante, sans redéploiement.
 *
 * `cacheLife("hours")` n'est pas un délai de propagation : c'est le filet de
 * sécurité si une invalidation est oubliée. Le chemin nominal reste
 * l'invalidation explicite.
 */

/** Étiquettes de cache — centralisées pour que l'admin ne les devine pas. */
export const catalogTags = {
  all: "products",
  product: (slug: string) => `product:${slug}`,
} as const;

export async function getProducts(): Promise<ProductView[]> {
  "use cache";
  cacheTag(catalogTags.all);
  cacheLife("hours");
  return listPublishedProducts(db);
}

export async function getProductBySlug(
  slug: string,
): Promise<ProductView | null> {
  "use cache";
  // Les deux étiquettes : `products` pour une invalidation globale (import,
  // réordonnancement), `product:<slug>` pour un changement de prix isolé.
  cacheTag(catalogTags.all, catalogTags.product(slug));
  cacheLife("hours");
  return findPublishedProductBySlug(db, slug);
}

export async function getProductSlugs(): Promise<string[]> {
  "use cache";
  cacheTag(catalogTags.all);
  cacheLife("hours");
  return listPublishedSlugs(db);
}

/**
 * À appeler depuis **toute** écriture admin sur le catalogue (HEP-39).
 *
 * `updateTag` invalide dans la requête courante : l'administrateur qui vient
 * de changer un prix voit le nouveau immédiatement, sans redéploiement et
 * sans attendre l'expiration. C'est la condition de la definition of done de
 * HEP-45 — un prix corrigé visible en moins de 30 secondes.
 *
 * Passer le slug quand une seule fiche change, pour ne pas jeter tout le
 * catalogue à chaque correction de faute de frappe.
 */
export function invalidateCatalog(slug?: string): void {
  updateTag(catalogTags.all);
  if (slug) updateTag(catalogTags.product(slug));
}
