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

export const mainNav = [
  { href: routes.shop, label: "Le Rituel" },
  { href: routes.histoire, label: "Histoire" },
  { href: routes.vision, label: "Vision" },
] as const;
