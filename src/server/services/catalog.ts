import type { Tx } from "../db";
import type { ProductCategory, ProductView } from "@/lib/products";
import type { Category, ImageRole, Prisma } from "@/generated/prisma/client";

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

// --- Administration --------------------------------------------------------

/** Ce que la liste d'administration affiche, brouillons et archives compris. */
export type AdminProductRow = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  category: Category;
  priceCents: number;
  volumeMl: number | null;
  weightGrams: number;
  stock: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  availability: ProductView["availability"];
  position: number;
  updatedAt: Date;
};

/**
 * Tous les produits, **sans** filtre de statut — l'admin doit voir ce que le
 * site ne montre pas.
 */
export async function listAllProducts(db: Tx): Promise<AdminProductRow[]> {
  return db.product.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      sku: true,
      name: true,
      category: true,
      priceCents: true,
      volumeMl: true,
      weightGrams: true,
      stock: true,
      status: true,
      availability: true,
      position: true,
      updatedAt: true,
    },
  });
}

/** Fiche complète pour le formulaire d'édition, quel que soit son statut. */
export async function findProductForEdit(db: Tx, slug: string) {
  return db.product.findUnique({ where: { slug } });
}

type ProductWriteData = {
  slug: string;
  sku: string;
  name: string;
  description: string;
  tagline: string | null;
  category: Category;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  availability: ProductView["availability"];
  priceCents: number;
  compareAtCents: number | null;
  volumeMl: number;
  weightGrams: number;
  usage: string | null;
  inci: string | null;
  precautions: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

/**
 * Crée ou met à jour une fiche, et journalise le changement.
 *
 * L'`AuditLog` enregistre le **diff**, pas l'état final : savoir qu'un prix
 * vaut 20 € n'aide pas, savoir qu'il est passé de 15 à 20 le 12 mars si.
 * C'est ce qu'on cherche quand un client conteste un prix affiché.
 */
export async function upsertProduct(
  db: Tx,
  data: ProductWriteData,
  actorId: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await db.product.findUnique({
    where: { slug: data.slug },
    select: { id: true },
  });

  if (!existing) {
    // `position` en fin de liste : un nouveau produit ne doit pas s'insérer
    // devant les autres sans que personne ne l'ait demandé.
    const last = await db.product.aggregate({ _max: { position: true } });
    const product = await db.product.create({
      data: { ...data, position: (last._max.position ?? -1) + 1 },
      select: { id: true },
    });

    await db.auditLog.create({
      data: {
        actorId,
        entity: "Product",
        entityId: product.id,
        action: "create",
        diff: data as unknown as Prisma.InputJsonObject,
      },
    });

    return { id: product.id, created: true };
  }

  const before = await db.product.findUniqueOrThrow({
    where: { id: existing.id },
  });

  await db.product.update({ where: { id: existing.id }, data });

  const changes: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, value] of Object.entries(data)) {
    const previous = (before as Record<string, unknown>)[key];
    if (previous !== value) {
      changes[key] = {
        avant: previous as Prisma.InputJsonValue,
        apres: value as Prisma.InputJsonValue,
      };
    }
  }

  // Rien n'a bougé : ne pas polluer le journal d'une entrée vide, sinon les
  // vraies modifications se noient dedans.
  if (Object.keys(changes).length > 0) {
    await db.auditLog.create({
      data: {
        actorId,
        entity: "Product",
        entityId: existing.id,
        action: "update",
        diff: changes as Prisma.InputJsonObject,
      },
    });
  }

  return { id: existing.id, created: false };
}

/** Applique un nouvel ordre d'affichage, dans une seule transaction. */
export async function reorderProducts(
  db: Tx,
  slugs: string[],
  actorId: string,
): Promise<void> {
  await Promise.all(
    slugs.map((slug, position) =>
      db.product.update({ where: { slug }, data: { position } }),
    ),
  );

  await db.auditLog.create({
    data: {
      actorId,
      entity: "Product",
      entityId: "*",
      action: "reorder",
      diff: { ordre: slugs },
    },
  });
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
