import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Client Prisma des tests.
 *
 * Volontairement **séparé** de `src/server/db.ts` : celui-ci met en cache un
 * singleton sur `globalThis` pour survivre au rechargement à chaud de Next,
 * comportement qui n'a pas sa place dans une suite de tests.
 *
 * Pointe sur le Postgres jetable (`bun run db:local:up`). Aucun test ne doit
 * jamais viser une base de preview ou de production.
 */
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL est requis pour les tests. Lancez `bun run db:local:up`.",
  );
}

if (/neon\.(tech|build)/.test(url)) {
  throw new Error(
    "Les tests refusent de tourner sur Neon : ils écrivent et suppriment des " +
      "données. Utilisez `bun run db:local:up`.",
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

/** Supprime les produits créés par les tests (cascade sur les mouvements). */
export async function cleanupTestProducts() {
  await testDb.product.deleteMany({ where: { slug: { startsWith: "test-" } } });
}
