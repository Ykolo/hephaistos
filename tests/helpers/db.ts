import { afterAll, beforeAll } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Client Prisma des tests.
 *
 * Volontairement **séparé** de `src/server/db.ts` : celui-ci met en cache un
 * singleton sur `globalThis` pour survivre au rechargement à chaud de Next,
 * comportement qui n'a pas sa place dans une suite de tests.
 *
 * Pointe sur le Postgres jetable (`bun run db:local:up`) ou sur une branche
 * Neon **créée pour l'occasion**. Aucun test ne doit jamais viser une base de
 * preview ou de production.
 */
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL est requis pour les tests. Lancez `bun run db:local:up`.",
  );
}

/**
 * Neon est refusé par défaut : une `.env.local` tirée par `vercel env pull`
 * pointe sur la vraie base, et les tests y écriraient puis supprimeraient
 * des données. `TEST_ON_NEON_BRANCH=1` lève le refus — à ne poser que dans
 * l'environnement d'une branche Neon jetable, jamais à côté d'une URL de
 * preview ou de production.
 */
if (/neon\.(tech|build)/.test(url) && process.env.TEST_ON_NEON_BRANCH !== "1") {
  throw new Error(
    "Les tests refusent de tourner sur Neon : ils écrivent et suppriment des " +
      "données. Utilisez `bun run db:local:up`, ou une branche Neon jetable " +
      "avec TEST_ON_NEON_BRANCH=1.",
  );
}

export const testDb = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

/** Produit isolé, propre à un test — évite toute interférence entre cas. */
export async function createTestProduct(overrides: {
  stock: number;
  lowStockAlert?: number;
  availability?: "IN_STOCK" | "PREORDER" | "COMING_SOON";
}) {
  const suffix = crypto.randomUUID().slice(0, 8);
  return testDb.product.create({
    data: {
      slug: `test-${suffix}`,
      sku: `TEST-${suffix}`,
      name: `Produit de test ${suffix}`,
      description: "Créé par la suite de tests.",
      category: "TREATMENT",
      priceCents: 2000,
      weightGrams: 100,
      status: "PUBLISHED",
      availability: overrides.availability ?? "IN_STOCK",
      stock: overrides.stock,
      lowStockAlert: overrides.lowStockAlert ?? 5,
    },
  });
}

/**
 * Supprime les produits créés par les tests (cascade sur les mouvements).
 *
 * `AuditLog` est purgé séparément : il n'a **volontairement** pas de clé
 * étrangère vers `Product`, pour que le journal survive à la suppression de ce
 * qu'il décrit — c'est tout l'intérêt d'un journal d'audit. Sans ce nettoyage
 * explicite, les entrées s'accumuleraient d'un test à l'autre.
 */
export async function cleanupTestProducts() {
  // Les liens de coffret partent d'abord : `BundleComponent.componentId` est
  // en `onDelete: Restrict`, et c'est voulu — en production, supprimer un
  // produit encore utilisé dans un coffret doit échouer plutôt que vider
  // silencieusement la composition.
  await testDb.bundleComponent.deleteMany({
    where: {
      OR: [
        { bundle: { slug: { startsWith: "test-" } } },
        { component: { slug: { startsWith: "test-" } } },
      ],
    },
  });
  await testDb.product.deleteMany({ where: { slug: { startsWith: "test-" } } });
  await testDb.auditLog.deleteMany({ where: { actorId: { startsWith: "admin-test" } } });
}

/**
 * Grille de port connue des tests (HEP-70).
 *
 * La grille est globale — il n'y a pas de « tranche de test » qu'un test
 * pourrait isoler par un préfixe. Le fichier qui en a besoin remplace donc la
 * grille pour sa durée et la **restaure** ensuite : la branche Neon de dev
 * garde ses tarifs.
 */
export const TEST_SHIPPING_GRID = [
  { carrier: "colissimo", method: "HOME", maxWeightGrams: 500, priceCents: 590, freeAboveCents: null },
  { carrier: "colissimo", method: "HOME", maxWeightGrams: 2000, priceCents: 990, freeAboveCents: null },
  { carrier: "mondial_relay", method: "PICKUP_POINT", maxWeightGrams: 1000, priceCents: 450, freeAboveCents: 6000 },
] as const;

export function withTestShippingGrid() {
  let saved: Awaited<ReturnType<typeof testDb.shippingRate.findMany>> = [];
  beforeAll(async () => {
    saved = await testDb.shippingRate.findMany();
    await testDb.shippingRate.deleteMany();
    await testDb.shippingRate.createMany({ data: [...TEST_SHIPPING_GRID] });
  });
  afterAll(async () => {
    await testDb.shippingRate.deleteMany();
    if (saved.length > 0) await testDb.shippingRate.createMany({ data: saved });
  });
}

/**
 * Pose le mode de livraison sans contrôle, comme si le client l'avait choisi.
 * `updateMany` : un panier absent ne lève rien, pour laisser `createOrder`
 * produire sa propre erreur.
 */
export async function chooseTestShipping(token: string, method: "HOME" | "PICKUP_POINT" = "HOME") {
  await testDb.cart.updateMany({ where: { token }, data: { shippingMethod: method } });
}
