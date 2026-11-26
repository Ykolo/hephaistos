import type { Metadata } from "next";

/**
 * Métadonnées des pages (HEP-98).
 *
 * Toute page publique passe par `pageMetadata` : titre, description,
 * **canonique** et Open Graph sont posés ensemble, et ne peuvent pas être
 * oubliés un par un.
 *
 * Pourquoi tout refaire à chaque page : Next fusionne les métadonnées clé par
 * clé, et une page qui déclare `openGraph` **remplace** celui du layout au
 * lieu de le compléter. Un `openGraph: { title }` isolé perdrait le nom du
 * site, la langue et l'image.
 */

export const SITE_NAME = "Héphaïstos";
export const SITE_TAGLINE = "Se forger, chaque jour.";

/**
 * Image de partage de repli (`src/app/opengraph-image.tsx`). Posée
 * explicitement : une page qui déclare son propre `openGraph` perd l'image
 * héritée du fichier racine.
 */
export const DEFAULT_SHARE_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
};

/** Au-delà, Google tronque dans ses résultats. */
const DESCRIPTION_MAX = 160;

/** Description propre et bornée : une ligne, sans couper un mot. */
export function metaDescription(text: string, max = DESCRIPTION_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : cut.length).replace(/[,;:.\s—-]+$/, "")}…`;
}

export function pageMetadata(input: {
  /** Sans le nom du site : le modèle `%s — Héphaïstos` du layout l'ajoute. */
  title: string;
  description: string;
  /** Chemin de la page, sans paramètres : la canonique ignore `?utm_…` et `?fbclid=…`. */
  path: string;
  /** Image de partage ; à défaut, l'image de repli du site (`opengraph-image`). */
  image?: { url: string; alt: string };
  noindex?: boolean;
}): Metadata {
  const description = metaDescription(input.description);
  return {
    title: input.title,
    description,
    alternates: { canonical: input.path },
    openGraph: {
      title: `${input.title} — ${SITE_NAME}`,
      description,
      url: input.path,
      siteName: SITE_NAME,
      locale: "fr_FR",
      type: "website",
      images: [input.image ? { url: input.image.url, alt: input.image.alt } : DEFAULT_SHARE_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: `${input.title} — ${SITE_NAME}`,
      description,
      images: [input.image?.url ?? DEFAULT_SHARE_IMAGE.url],
    },
    ...(input.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

/**
 * Fiche produit : champs SEO de l'admin s'ils sont remplis, sinon le nom et
 * l'accroche. Une fiche ne peut pas sortir sans titre ni description, même si
 * l'admin laisse les champs SEO vides.
 */
export function productMetadata(product: {
  slug: string;
  name: string;
  tagline: string | null;
  description: string;
  seoTitle: string | null;
  seoDescription: string | null;
  image: string;
  priceCents: number;
  availability: string;
}): Metadata {
  const title = product.seoTitle?.trim() || product.name;
  const description =
    product.seoDescription?.trim() ||
    [product.tagline, product.description].filter((s) => s && s.trim()).join(". ");
  const base = pageMetadata({
    title,
    description: description || product.name,
    path: `/produit/${product.slug}`,
    // L'image générée par `produit/[id]/opengraph-image.tsx` (JPEG 1200 × 630),
    // pas la photo WebP brute, que LinkedIn n'affiche pas.
    image: { url: `/produit/${product.slug}/opengraph-image`, alt: product.name },
  });

  // Next refuse `product` comme type Open Graph (« Invalid OpenGraph type ») :
  // le type est retiré de l'Open Graph et posé par `other`, qui l'écrit en
  // `<meta name="og:type">`. Les robots de Facebook et de LinkedIn lisent les
  // balises `og:` en `name` comme en `property`. Le prix suit, pour les
  // aperçus de Messenger et de Pinterest.
  const { type: _omitted, ...openGraph } = (base.openGraph ?? {}) as Record<string, unknown>;
  void _omitted;
  return {
    ...base,
    openGraph,
    other: {
      "og:type": "product",
      "product:price:amount": (product.priceCents / 100).toFixed(2),
      "product:price:currency": "EUR",
      "product:availability": product.availability === "IN_STOCK" ? "in stock" : product.availability === "PREORDER" ? "preorder" : "out of stock",
    },
  };
}
