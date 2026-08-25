import type { Tx } from "../db";
import type { ProductCategory, ProductView } from "@/lib/products";
import type { Category, ImageRole } from "@/generated/prisma/client";

/**
 * Lecture du catalogue public.
 *
 * Service **pur** au sens de `src/server/services/README.md` : il reçoit le
 * client Prisma et ne lit ni cookie ni header. La mise en cache est la
 * responsabilité de l'appelant (`src/server/catalog.ts`) — mélanger les deux
 * rendrait ces fonctions intestables.
 */

/** L'énumération Prisma est en anglais ; l'affichage est en français. */
const CATEGORY_LABEL: Record<Category, ProductCategory> = {
  CLEANSING: "Nettoyage",
  TREATMENT: "Soin ciblé",
  HYDRATION: "Hydratation",
};

/** Ce que la projection publique a besoin de lire, et rien de plus. */
const productSelect = {
  slug: true,
  name: true,
  tagline: true,
  description: true,
  category: true,
  priceCents: true,
  compareAtCents: true,
  volumeMl: true,
  availability: true,
  preorderShipsAt: true,
  usage: true,
  inci: true,
  precautions: true,
  seoTitle: true,
  seoDescription: true,
  updatedAt: true,
  benefits: {
    select: { label: true },
    orderBy: { position: "asc" },
  },
  images: {
    select: { blobUrl: true, role: true },
    orderBy: { position: "asc" },
  },
} as const;

type ProductRow = {
  slug: string;
  name: string;
  tagline: string | null;
  description: string;
  category: Category;
  priceCents: number;
  compareAtCents: number | null;
  volumeMl: number | null;
  availability: ProductView["availability"];
  preorderShipsAt: Date | null;
  usage: string | null;
  inci: string | null;
  precautions: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: Date;
  benefits: { label: string }[];
  images: { blobUrl: string; role: ImageRole }[];
};

function toView(row: ProductRow): ProductView {
  const byRole = (role: ImageRole) =>
    row.images.find((i) => i.role === role)?.blobUrl;

  // Un produit sans image ne doit pas casser la page : on retombe sur la
  // première disponible, puis sur une chaîne vide que `next/image` refusera
  // visiblement en développement plutôt que silencieusement en production.
  const image = byRole("PRIMARY") ?? row.images[0]?.blobUrl ?? "";

  return {
    slug: row.slug,
    name: row.name,
    category: CATEGORY_LABEL[row.category],
    tagline: row.tagline,
    description: row.description,
    priceCents: row.priceCents,
    compareAtCents: row.compareAtCents,
    volumeMl: row.volumeMl,
    availability: row.availability,
    preorderShipsAt: row.preorderShipsAt,
    image,
    imageHover: byRole("HOVER") ?? image,
    gallery: row.images.map((i) => i.blobUrl),
    benefits: row.benefits.map((b) => b.label),
    usage: row.usage,
    inci: row.inci,
    precautions: row.precautions,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    updatedAt: row.updatedAt,
  };
}

/**
 * Les produits publiés, dans l'ordre d'affichage choisi en admin.
 *
 * Le filtre `status: PUBLISHED` est ici et pas chez l'appelant : c'est la
 * seule garantie qu'un brouillon ne fuite jamais sur le site public, quelle
 * que soit la page qui appelle.
 */
export async function listPublishedProducts(db: Tx): Promise<ProductView[]> {
  const rows = await db.product.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: productSelect,
  });
  return rows.map(toView);
}

/** Un produit publié par son slug, ou `null` s'il n'existe pas ou n'est pas publié. */
export async function findPublishedProductBySlug(
  db: Tx,
  slug: string,
): Promise<ProductView | null> {
  const row = await db.product.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: productSelect,
  });
  return row ? toView(row) : null;
}

/** Slugs publiés — utilisé par `generateStaticParams` et le sitemap (HEP-97). */
export async function listPublishedSlugs(db: Tx): Promise<string[]> {
  const rows = await db.product.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { position: "asc" },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}
