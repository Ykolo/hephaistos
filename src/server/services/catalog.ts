import { ActionError } from "../errors";
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
  kind: true,
  stock: true,
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
  // Nécessaire au stock calculé des coffrets (HEP-40).
  components: {
    select: { qty: true, component: { select: { stock: true } } },
  },
} as const;

type ProductRow = {
  slug: string;
  kind: "SIMPLE" | "BUNDLE";
  stock: number;
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
  components: { qty: number; component: { stock: number } }[];
};

/**
 * Stock vendable — **calculé** pour un coffret, jamais lu sur lui.
 *
 * `min(stock du composant / quantité requise)` : un coffret dont un seul
 * composant manque n'est pas vendable, quel que soit l'état des deux autres.
 * Même règle que `availableUnits()` dans le service stock, appliquée ici sur
 * les données déjà chargées pour éviter une requête par produit.
 */
function computeAvailableUnits(row: ProductRow): number {
  if (row.kind === "SIMPLE") return row.stock;
  if (row.components.length === 0) return 0;
  return Math.min(
    ...row.components.map((c) =>
      Math.floor(c.component.stock / Math.max(c.qty, 1)),
    ),
  );
}

function toView(row: ProductRow): ProductView {
  const byRole = (role: ImageRole) =>
    row.images.find((i) => i.role === role)?.blobUrl;

  // Un produit sans image ne doit pas casser la page : on retombe sur la
  // première disponible, puis sur une chaîne vide que `next/image` refusera
  // visiblement en développement plutôt que silencieusement en production.
  const image = byRole("PRIMARY") ?? row.images[0]?.blobUrl ?? "";

  const units = computeAvailableUnits(row);

  return {
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    availableUnits: units,
    category: CATEGORY_LABEL[row.category],
    tagline: row.tagline,
    description: row.description,
    priceCents: row.priceCents,
    compareAtCents: row.compareAtCents,
    volumeMl: row.volumeMl,
    // Un coffret annoncé en stock mais dont un composant manque doit
    // s'afficher épuisé : le client ne doit pas découvrir la rupture au
    // paiement. Les autres états (bientôt, précommande, arrêté) décrivent
    // déjà une indisponibilité et ne sont pas réécrits.
    availability:
      row.availability === "IN_STOCK" && units <= 0
        ? "OUT_OF_STOCK"
        : row.availability,
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
  kind: "SIMPLE" | "BUNDLE";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  availability: ProductView["availability"];
  priceCents: number;
  compareAtCents: number | null;
  volumeMl: number;
  weightGrams: number;
  preorderShipsAt: Date | null;
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

/**
 * Remplace la composition d'un coffret (HEP-40).
 *
 * Deux refus explicites plutôt qu'un état incohérent découvert à la vente :
 * un coffret ne peut pas se contenir lui-même, ni contenir un autre coffret.
 * Le second cas rendrait le calcul de stock récursif et le décrément
 * impossible à ordonner — donc les interblocages inévitables.
 */
export async function setBundleComposition(
  db: Tx,
  bundleSlug: string,
  components: { slug: string; qty: number }[],
  actorId: string,
): Promise<void> {
  const bundle = await db.product.findUnique({
    where: { slug: bundleSlug },
    select: { id: true, kind: true },
  });
  if (!bundle) throw new ActionError("NOT_FOUND", "Ce coffret est introuvable.");
  if (bundle.kind !== "BUNDLE") {
    throw new ActionError(
      "VALIDATION",
      "Ce produit n'est pas un coffret : passez son type à BUNDLE avant d'en définir la composition.",
    );
  }

  const rows = await db.product.findMany({
    where: { slug: { in: components.map((c) => c.slug) } },
    select: { id: true, slug: true, kind: true, name: true },
  });

  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const resolved = components.map((c) => {
    const row = bySlug.get(c.slug);
    if (!row) {
      throw new ActionError("NOT_FOUND", `Le produit « ${c.slug} » est introuvable.`);
    }
    if (row.id === bundle.id) {
      throw new ActionError(
        "VALIDATION",
        "Un coffret ne peut pas se contenir lui-même.",
      );
    }
    if (row.kind === "BUNDLE") {
      throw new ActionError(
        "VALIDATION",
        `« ${row.name} » est un coffret : les coffrets imbriqués ne sont pas autorisés.`,
      );
    }
    return { componentId: row.id, qty: c.qty };
  });

  // Remplacement en bloc : une composition partiellement mise à jour vendrait
  // un coffret qui ne correspond plus à ce qu'on prépare.
  await db.bundleComponent.deleteMany({ where: { bundleId: bundle.id } });
  await db.bundleComponent.createMany({
    data: resolved.map((r) => ({ bundleId: bundle.id, ...r })),
  });

  await db.auditLog.create({
    data: {
      actorId,
      entity: "Product",
      entityId: bundle.id,
      action: "bundle.composition",
      diff: { composition: components } as unknown as Prisma.InputJsonObject,
    },
  });
}

// --- Précommandes (HEP-42) -------------------------------------------------

/**
 * Clients à prévenir d'un décalage de date de précommande.
 *
 * Ce n'est pas du confort : l'encaissement étant immédiat, la date annoncée
 * engage la marque. Au-delà de 30 jours de retard sans nouvelle date acceptée,
 * le client peut exiger le remboursement (code de la consommation). Ne pas
 * prévenir, c'est laisser courir ce délai à son insu.
 *
 * Renvoie une adresse par commande en attente, dédoublonnée.
 */
export async function listPreorderCustomers(
  db: Tx,
  productId: string,
): Promise<{ email: string; orderNumber: string; orderId: string }[]> {
  const orders = await db.order.findMany({
    where: {
      isPreorder: true,
      // Une commande déjà expédiée, livrée ou annulée n'attend plus rien.
      status: { in: ["PAID", "PREPARING"] },
      items: { some: { productId } },
    },
    select: { id: true, email: true, number: true },
    orderBy: { createdAt: "asc" },
  });

  const seen = new Set<string>();
  return orders
    .filter((o) => {
      const key = o.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((o) => ({ email: o.email, orderNumber: o.number, orderId: o.id }));
}

/**
 * Change la date d'expédition annoncée et renvoie qui doit être prévenu.
 *
 * Le décalage est journalisé même si personne n'attend encore : c'est la
 * trace qui permettra plus tard de prouver quand la promesse a changé.
 */
export async function shiftPreorderDate(
  db: Tx,
  slug: string,
  newDate: Date,
  actorId: string,
): Promise<{
  previous: Date | null;
  next: Date;
  toNotify: { email: string; orderNumber: string; orderId: string }[];
}> {
  const product = await db.product.findUnique({
    where: { slug },
    select: { id: true, preorderShipsAt: true, availability: true },
  });
  if (!product) throw new ActionError("NOT_FOUND", "Ce produit est introuvable.");
  if (product.availability !== "PREORDER") {
    throw new ActionError(
      "VALIDATION",
      "Ce produit n'est pas en précommande.",
    );
  }

  const previous = product.preorderShipsAt;
  await db.product.update({
    where: { id: product.id },
    data: { preorderShipsAt: newDate },
  });

  const toNotify = await listPreorderCustomers(db, product.id);

  await db.auditLog.create({
    data: {
      actorId,
      entity: "Product",
      entityId: product.id,
      action: "preorder.shift",
      diff: {
        avant: previous?.toISOString() ?? null,
        apres: newDate.toISOString(),
        clientsAPrevenir: toNotify.length,
      } as unknown as Prisma.InputJsonObject,
    },
  });

  return { previous, next: newDate, toNotify };
}

/** Composition actuelle d'un coffret, pour l'écran d'administration. */
export async function getBundleComposition(db: Tx, bundleSlug: string) {
  return db.bundleComponent.findMany({
    where: { bundle: { slug: bundleSlug } },
    select: {
      qty: true,
      component: { select: { slug: true, name: true, stock: true, sku: true } },
    },
    orderBy: { componentId: "asc" },
  });
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
