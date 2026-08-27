import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  availableUnits,
  expandToStockLines,
  restockProduct,
  sellProduct,
  stockFromMovements,
} from "@/server/services/stock";
import { setBundleComposition } from "@/server/services/catalog";
import { cleanupTestProducts, createTestProduct, testDb } from "./helpers/db";

beforeEach(cleanupTestProducts);
afterAll(async () => {
  await cleanupTestProducts();
  await testDb.$disconnect();
});

/** Un coffret et ses trois composants, chacun avec le stock demandé. */
async function makeBundle(stocks: [number, number, number]) {
  const [a, b, c] = await Promise.all(
    stocks.map((stock) => createTestProduct({ stock })),
  );
  const bundle = await createTestProduct({ stock: 0 });
  await testDb.product.update({
    where: { id: bundle.id },
    data: { kind: "BUNDLE" },
  });
  await testDb.bundleComponent.createMany({
    data: [a, b, c].map((p) => ({ bundleId: bundle.id, componentId: p.id, qty: 1 })),
  });
  return { bundle, components: [a, b, c] };
}

async function stockOf(id: string) {
  return (await testDb.product.findUniqueOrThrow({ where: { id } })).stock;
}

describe("coffret — vente", () => {
  it("vendre 1 coffret fait baisser les 3 stocks de 1", async () => {
    const { bundle, components } = await makeBundle([5, 5, 5]);

    await testDb.$transaction((tx) =>
      sellProduct(tx, { productId: bundle.id, qty: 1, reason: "SALE" }),
    );

    for (const c of components) expect(await stockOf(c.id)).toBe(4);
    // Le coffret n'a pas de stock propre : il ne doit pas bouger.
    expect(await stockOf(bundle.id)).toBe(0);
  });

  it("écrit un mouvement par composant, aucun sur le coffret", async () => {
    const { bundle, components } = await makeBundle([5, 5, 5]);

    await testDb.$transaction((tx) =>
      sellProduct(tx, { productId: bundle.id, qty: 1, reason: "SALE" }),
    );

    for (const c of components) {
      expect(await stockFromMovements(testDb, c.id)).toBe(-1);
    }
    // Un mouvement au nom du coffret fausserait la somme de son historique.
    expect(await stockFromMovements(testDb, bundle.id)).toBe(0);
  });

  it("respecte la quantité de chaque composant", async () => {
    const { bundle, components } = await makeBundle([10, 10, 10]);
    await testDb.bundleComponent.update({
      where: { bundleId_componentId: { bundleId: bundle.id, componentId: components[1].id } },
      data: { qty: 2 },
    });

    await testDb.$transaction((tx) =>
      sellProduct(tx, { productId: bundle.id, qty: 3, reason: "SALE" }),
    );

    expect(await stockOf(components[0].id)).toBe(7); // 3 × 1
    expect(await stockOf(components[1].id)).toBe(4); // 3 × 2
    expect(await stockOf(components[2].id)).toBe(7);
  });

  it("refuse la vente si un seul composant est en rupture, et ne consomme rien", async () => {
    const { bundle, components } = await makeBundle([5, 0, 5]);

    await expect(
      testDb.$transaction((tx) =>
        sellProduct(tx, { productId: bundle.id, qty: 1, reason: "SALE" }),
      ),
    ).rejects.toMatchObject({ code: "OUT_OF_STOCK" });

    // Le rollback doit rendre ce qui avait déjà été décrémenté avant l'échec.
    expect(await stockOf(components[0].id)).toBe(5);
    expect(await stockOf(components[2].id)).toBe(5);
  });
});

describe("coffret — ordre de décrément (anti-interblocage)", () => {
  it("les lignes sont triées par identifiant de composant", async () => {
    const { bundle } = await makeBundle([5, 5, 5]);

    const lines = await expandToStockLines(testDb, bundle.id, 1);
    const ids = lines.map((l) => l.productId);

    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  });

  it("coffret et composant vendus en concurrence : pas d'interblocage, pas de survente", async () => {
    // Le cas décrit par l'issue : une commande « coffret », une commande
    // « composant seul ».
    //
    // ⚠️ Ce test est un garde-fou, pas une preuve. Vérifié par mutation :
    // inverser l'ordre des composants ne le fait PAS échouer — un
    // interblocage est probabiliste et dépend de l'ordonnancement. C'est le
    // test « les lignes sont triées » ci-dessus qui verrouille réellement
    // l'invariant ; celui-ci ne détecte qu'une régression flagrante.
    const { bundle, components } = await makeBundle([10, 10, 10]);
    const single = components[2];

    const results = await Promise.allSettled([
      ...Array.from({ length: 6 }, () =>
        testDb.$transaction((tx) =>
          sellProduct(tx, { productId: bundle.id, qty: 1, reason: "SALE" }),
        ),
      ),
      ...Array.from({ length: 6 }, () =>
        testDb.$transaction((tx) =>
          sellProduct(tx, { productId: single.id, qty: 1, reason: "SALE" }),
        ),
      ),
    ]);

    // Aucune transaction ne doit mourir d'un interblocage : les seuls échecs
    // acceptables sont des ruptures de stock.
    const deadlocks = results.filter(
      (r) =>
        r.status === "rejected" &&
        /deadlock/i.test(String((r as PromiseRejectedResult).reason?.message ?? "")),
    );
    expect(deadlocks).toHaveLength(0);

    // 6 coffrets + 6 unités seules = 12 sur le composant partagé, pour 10.
    expect(await stockOf(single.id)).toBeGreaterThanOrEqual(0);
    const okCount = results.filter((r) => r.status === "fulfilled").length;
    expect(okCount).toBeLessThanOrEqual(10);
  });
});

describe("coffret — stock calculé", () => {
  it("vaut le minimum sur les composants", async () => {
    const { bundle } = await makeBundle([7, 3, 12]);
    expect(await availableUnits(testDb, bundle.id)).toBe(3);
  });

  it("tombe à zéro dès qu'un composant manque", async () => {
    const { bundle } = await makeBundle([9, 0, 9]);
    expect(await availableUnits(testDb, bundle.id)).toBe(0);
  });

  it("tient compte des quantités requises", async () => {
    const { bundle, components } = await makeBundle([10, 10, 10]);
    await testDb.bundleComponent.update({
      where: { bundleId_componentId: { bundleId: bundle.id, componentId: components[0].id } },
      data: { qty: 4 },
    });
    // 10 / 4 = 2 coffrets entiers, pas 2,5.
    expect(await availableUnits(testDb, bundle.id)).toBe(2);
  });

  it("un coffret sans composition n'est pas vendable", async () => {
    const bundle = await createTestProduct({ stock: 999 });
    await testDb.product.update({
      where: { id: bundle.id },
      data: { kind: "BUNDLE" },
    });

    // Stock propre à 999, mais rien à préparer : zéro.
    expect(await availableUnits(testDb, bundle.id)).toBe(0);
    await expect(
      testDb.$transaction((tx) =>
        sellProduct(tx, { productId: bundle.id, qty: 1, reason: "SALE" }),
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_UNAVAILABLE" });
  });
});

describe("coffret — remboursement", () => {
  it("remet une unité de chaque composant, tracée", async () => {
    const { bundle, components } = await makeBundle([5, 5, 5]);

    await testDb.$transaction((tx) =>
      sellProduct(tx, { productId: bundle.id, qty: 1, reason: "SALE" }),
    );
    await testDb.$transaction((tx) =>
      restockProduct(tx, { productId: bundle.id, qty: 1, reason: "REFUND" }),
    );

    for (const c of components) {
      expect(await stockOf(c.id)).toBe(5);
      // Vente puis remboursement : la somme des mouvements revient à zéro.
      expect(await stockFromMovements(testDb, c.id)).toBe(0);

      const refund = await testDb.stockMovement.findFirstOrThrow({
        where: { productId: c.id, reason: "REFUND" },
      });
      expect(refund.delta).toBe(1);
    }
  });
});

describe("coffret — coffrets imbriqués", () => {
  it("refuse un coffret comme composant", async () => {
    const { bundle: outer } = await makeBundle([5, 5, 5]);
    const { bundle: inner } = await makeBundle([5, 5, 5]);

    await expect(
      setBundleComposition(
        testDb,
        outer.slug,
        [{ slug: inner.slug, qty: 1 }],
        "admin-test",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuse qu'un coffret se contienne lui-même", async () => {
    const { bundle } = await makeBundle([5, 5, 5]);

    await expect(
      setBundleComposition(
        testDb,
        bundle.slug,
        [{ slug: bundle.slug, qty: 1 }],
        "admin-test",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuse de composer un produit qui n'est pas un coffret", async () => {
    const simple = await createTestProduct({ stock: 5 });
    const other = await createTestProduct({ stock: 5 });

    await expect(
      setBundleComposition(
        testDb,
        simple.slug,
        [{ slug: other.slug, qty: 1 }],
        "admin-test",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
