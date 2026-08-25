import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  adjustStock,
  decrementStock,
  incrementStock,
  stockFromMovements,
} from "@/server/services/stock";
import { ActionError } from "@/server/errors";
import { cleanupTestProducts, createTestProduct, testDb } from "./helpers/db";

beforeEach(cleanupTestProducts);
afterAll(async () => {
  await cleanupTestProducts();
  await testDb.$disconnect();
});

describe("stock — invariant du dernier flacon (docs/BACKEND.md §4.1)", () => {
  it("deux commandes concurrentes sur le dernier flacon : une seule aboutit", async () => {
    const product = await createTestProduct({ stock: 1 });

    // Les deux transactions démarrent avant que l'une ait fini : c'est
    // exactement la situation où un `findUnique` suivi d'un `update` vendrait
    // le flacon deux fois.
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        testDb.$transaction((tx) =>
          decrementStock(tx, {
            productId: product.id,
            qty: 1,
            reason: "SALE",
          }),
        ),
      ),
    );

    const ok = results.filter((r) => r.status === "fulfilled");
    const ko = results.filter((r) => r.status === "rejected");

    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);

    // L'échec doit être exploitable par l'UI, pas une erreur brute.
    const error = (ko[0] as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(ActionError);
    expect((error as ActionError).code).toBe("OUT_OF_STOCK");

    const after = await testDb.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(after.stock).toBe(0);
  });

  it("25 acheteurs simultanés pour 10 unités : exactement 10 passent", async () => {
    const product = await createTestProduct({ stock: 10, lowStockAlert: 0 });

    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () =>
        testDb.$transaction((tx) =>
          decrementStock(tx, { productId: product.id, qty: 1, reason: "SALE" }),
        ),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(15);

    const after = await testDb.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(after.stock).toBe(0);
  });

  it("une transaction annulée rend le stock", async () => {
    const product = await createTestProduct({ stock: 3 });

    await expect(
      testDb.$transaction(async (tx) => {
        await decrementStock(tx, {
          productId: product.id,
          qty: 2,
          reason: "SALE",
        });
        // Simule un échec plus loin dans la création de commande.
        throw new Error("paiement refusé");
      }),
    ).rejects.toThrow("paiement refusé");

    const after = await testDb.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(after.stock).toBe(3);

    // Le mouvement ne doit pas survivre au rollback non plus, sinon
    // l'historique ne reconstituerait plus le stock.
    expect(await stockFromMovements(testDb, product.id)).toBe(0);
  });
});

describe("stock — blocage de la vente à zéro", () => {
  it("refuse de vendre un produit épuisé", async () => {
    const product = await createTestProduct({ stock: 0 });

    await expect(
      testDb.$transaction((tx) =>
        decrementStock(tx, { productId: product.id, qty: 1, reason: "SALE" }),
      ),
    ).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
  });

  it("refuse une quantité supérieure au stock", async () => {
    const product = await createTestProduct({ stock: 2 });

    await expect(
      testDb.$transaction((tx) =>
        decrementStock(tx, { productId: product.id, qty: 3, reason: "SALE" }),
      ),
    ).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
  });

  it("autorise la vente sans stock en précommande", async () => {
    const product = await createTestProduct({
      stock: 0,
      availability: "PREORDER",
    });

    const result = await testDb.$transaction((tx) =>
      decrementStock(tx, { productId: product.id, qty: 2, reason: "SALE" }),
    );

    // Stock négatif = flacons dus, pas une incohérence.
    expect(result.remaining).toBe(-2);
  });
});

describe("stock — seuil d'alerte", () => {
  it("ne signale le franchissement qu'une seule fois", async () => {
    const product = await createTestProduct({ stock: 7, lowStockAlert: 5 });

    const crossings: boolean[] = [];
    // 7 → 6 → 5 → 4 → 3 : le seuil n'est franchi qu'au passage 6 → 5.
    for (let i = 0; i < 4; i++) {
      const r = await testDb.$transaction((tx) =>
        decrementStock(tx, { productId: product.id, qty: 1, reason: "SALE" }),
      );
      crossings.push(r.crossedLowStockThreshold);
    }

    expect(crossings).toEqual([false, true, false, false]);
    expect(crossings.filter(Boolean)).toHaveLength(1);
  });

  it("signale le franchissement même quand une commande saute par-dessus le seuil", async () => {
    const product = await createTestProduct({ stock: 10, lowStockAlert: 5 });

    const r = await testDb.$transaction((tx) =>
      decrementStock(tx, { productId: product.id, qty: 8, reason: "SALE" }),
    );

    expect(r.remaining).toBe(2);
    expect(r.crossedLowStockThreshold).toBe(true);
  });
});

describe("stock — historique", () => {
  it("la somme des mouvements reconstitue le stock courant", async () => {
    const product = await createTestProduct({ stock: 0 });

    await testDb.$transaction(async (tx) => {
      await incrementStock(tx, {
        productId: product.id,
        qty: 20,
        reason: "RESTOCK",
      });
      await decrementStock(tx, {
        productId: product.id,
        qty: 3,
        reason: "SALE",
      });
      await decrementStock(tx, {
        productId: product.id,
        qty: 2,
        reason: "SALE",
      });
      await incrementStock(tx, {
        productId: product.id,
        qty: 1,
        reason: "CANCEL",
      });
    });

    const current = await testDb.product.findUniqueOrThrow({
      where: { id: product.id },
    });

    expect(current.stock).toBe(16);
    expect(await stockFromMovements(testDb, product.id)).toBe(current.stock);
  });

  it("chaque mouvement conserve sa raison et sa commande", async () => {
    const product = await createTestProduct({ stock: 5 });

    await testDb.$transaction((tx) =>
      decrementStock(tx, {
        productId: product.id,
        qty: 1,
        reason: "SALE",
        orderId: "commande-de-test",
      }),
    );

    const movement = await testDb.stockMovement.findFirstOrThrow({
      where: { productId: product.id },
    });
    expect(movement.reason).toBe("SALE");
    expect(movement.delta).toBe(-1);
    expect(movement.orderId).toBe("commande-de-test");
  });
});

describe("stock — ajustement manuel", () => {
  it("exige une note", async () => {
    const product = await createTestProduct({ stock: 5 });

    await expect(
      adjustStock(testDb, {
        productId: product.id,
        newStock: 3,
        actorId: "admin",
        note: "   ",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("enregistre l'écart et son auteur", async () => {
    const product = await createTestProduct({ stock: 5 });

    const r = await adjustStock(testDb, {
      productId: product.id,
      newStock: 3,
      actorId: "admin-42",
      note: "Inventaire : 2 flacons cassés",
    });

    expect(r.remaining).toBe(3);
    expect(await stockFromMovements(testDb, product.id)).toBe(-2);

    const movement = await testDb.stockMovement.findFirstOrThrow({
      where: { productId: product.id, reason: "MANUAL" },
    });
    expect(movement.delta).toBe(-2);
    expect(movement.actorId).toBe("admin-42");
  });

  it("refuse un stock négatif", async () => {
    const product = await createTestProduct({ stock: 5 });

    await expect(
      adjustStock(testDb, {
        productId: product.id,
        newStock: -1,
        actorId: "admin",
        note: "erreur",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
