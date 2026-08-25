/**
 * Types du catalogue.
 *
 * Les **données** vivent en base depuis HEP-45 ; ce fichier ne garde que les
 * formes. Un produit affiché n'est pas un enregistrement Prisma : le front n'a
 * aucune raison de connaître le stock, le poids d'expédition ou le SKU, et les
 * lui envoyer reviendrait à publier des informations commerciales internes
 * dans le HTML de chaque page.
 */

export type ProductCategory = "Nettoyage" | "Soin ciblé" | "Hydratation";

/** Disponibilité, reprise telle quelle de l'énumération Prisma. */
export type ProductAvailability =
  | "COMING_SOON"
  | "IN_STOCK"
  | "PREORDER"
  | "OUT_OF_STOCK"
  | "DISCONTINUED";

/** Projection d'un produit destinée à l'affichage public. */
export interface ProductView {
  /** Identifiant d'URL — `nettoyant`, `serum`, `creme`. */
  slug: string;
  name: string;
  category: ProductCategory;
  tagline: string | null;
  description: string;

  /** Montants en centimes. Le formatage passe par `src/lib/format.ts`. */
  priceCents: number;
  compareAtCents: number | null;
  volumeMl: number | null;

  availability: ProductAvailability;
  preorderShipsAt: Date | null;

  /** Image de couverture, puis image de survol (retombe sur la couverture). */
  image: string;
  imageHover: string;
  gallery: string[];

  benefits: string[];
  usage: string | null;
  inci: string | null;
  precautions: string | null;

  /** Exposé pour le lot 13 (métadonnées, sitemap, JSON-LD — HEP-92). */
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: Date;
}
