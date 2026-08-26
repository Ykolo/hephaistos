import { getSearchProducts } from "@/server/catalog";
import { SearchOverlay } from "@/components/search-overlay";

/**
 * Composant serveur qui alimente la recherche du chrome.
 *
 * Il existe pour une raison précise : le layout racine enveloppe **toutes** les
 * routes, y compris les routes pleinement dynamiques comme l'administration.
 * Passer la liste — ou même sa promesse — directement en prop du chrome, qui
 * est un composant client, force sa résolution au rendu de celui-ci, donc hors
 * de toute frontière `Suspense`. Next ne peut alors plus prérendre de coquille
 * statique et le build échoue.
 *
 * En rendant ce composant dans un `Suspense` **côté serveur** puis en le
 * passant au chrome comme simple `ReactNode`, la coquille se prérend et la
 * liste arrive en flux.
 */
export async function SearchOverlayData() {
  const products = await getSearchProducts();
  return <SearchOverlay products={products} />;
}
