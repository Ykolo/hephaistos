export const routes = {
  home: "/",
  shop: "/boutique",
  product: (id: string) => `/produit/${id}`,
  histoire: "/histoire",
  vision: "/vision",
  avis: "/avis",
  cart: "/panier",
  contact: "/contact",
  newsletter: "/newsletter",
  legal: "/legal",
} as const;

/**
 * Commandes en administration (HEP-56).
 *
 * Le numéro passe en paramètre de recherche, pas en segment de chemin : un
 * chemin dynamique inconnu à la construction rend `usePathname` — lu par le
 * chrome du site, hors `<Suspense>` — bloquant pour toute la page.
 */
export const adminRoutes = {
  orders: "/admin/commandes",
  order: (number: string) => `/admin/commandes/fiche?numero=${encodeURIComponent(number)}`,
  packingSlip: (number: string) =>
    `/admin/commandes/preparation?numero=${encodeURIComponent(number)}`,
} as const;

export const mainNav = [
  { href: routes.shop, label: "Le Rituel" },
  { href: routes.histoire, label: "Histoire" },
  { href: routes.vision, label: "Vision" },
] as const;
