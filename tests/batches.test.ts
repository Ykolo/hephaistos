import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  assignBatchToOrderItem,
  listBatches,
  recallByBatch,
  recallToCsv,
  receiveBatch,
} from "@/server/services/batches";
import { stockFromMovements } from "@/server/services/stock";
import { cleanupTestProducts, createTestProduct, testDb } from "./helpers/db";

beforeEach(async () => {
  await testDb.orderItem.deleteMany({
    where: { order: { number: { startsWith: "TEST-" } } },
  });
  await testDb.order.deleteMany({ where: { number: { startsWith: "TEST-" } } });
  await cleanupTestProducts();
});

afterAll(async () => {
  await testDb.orderItem.deleteMany({
    where: { order: { number: { startsWith: "TEST-" } } },
  });
  await testDb.order.deleteMany({ where: { number: { startsWith: "TEST-" } } });
  await cleanupTestProducts();
  await testDb.$disconnect();
});

/** Commande expédiée avec une ligne sur le produit donné. */
async function shippedOrder(
  productId: string,
  email: string,
  batchCode: string | null,
) {
  const n = crypto.randomUUID().slice(0, 8);
  const order = await testDb.order.create({
    data: {
      number: `TEST-${n}`,
      publicToken: `tok-${n}`,
      email,
      status: "SHIPPED",
      subtotalCents: 2000,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 2000,
      shippingAddress: {},
      billingAddress: {},
      shippedAt: new Date(),
      items: {
        create: {
          productId,
          nameSnapshot: "Produit de test",
          skuSnapshot: "TEST-SKU",
          priceCentsSnapshot: 2000,
          qty: 1,
          batchCode,
        },
      },
    },
    select: { id: true, number: true },
  });
  return order;
}

describe("réception de lot", () => {
  it("enregistre le lot et met le stock à jour", async () => {
    const p = await createTestProduct({ stock: 0 });

    const r = await receiveBatch(testDb, {
      productId: p.id,
      code: "LOT-A",
      quantity: 120,
      expiresAt: null,
      actorId: "admin-test",
    });

    expect(r.stock).toBe(120);
    // Le stock passe par le service dédié : l'historique doit concorder.
    expect(await stockFromMovements(testDb, p.id)).toBe(120);

    const movement = await testDb.stockMovement.findFirstOrThrow({
      where: { productId: p.id, reason: "RESTOCK" },
    });
    expect(movement.note).toContain("LOT-A");
  });

  it("refuse deux fois le même code pour un produit", async () => {
    const p = await createTestProduct({ stock: 0 });
    const base = {
      productId: p.id,
      code: "LOT-B",
      quantity: 10,
      expiresAt: null,
      actorId: "admin-test",
    };
    await receiveBatch(testDb, base);

    await expect(receiveBatch(testDb, base)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("accepte le même code sur deux produits différents", async () => {
    // Les fournisseurs numérotent par référence : le même code peut exister
    // pour le sérum et pour la crème sans que ce soit une erreur.
    const a = await createTestProduct({ stock: 0 });
    const b = await createTestProduct({ stock: 0 });

    await receiveBatch(testDb, {
      productId: a.id, code: "LOT-C", quantity: 5, expiresAt: null, actorId: "admin-test",
    });
    await expect(
      receiveBatch(testDb, {
        productId: b.id, code: "LOT-C", quantity: 5, expiresAt: null, actorId: "admin-test",
      }),
    ).resolves.toBeTruthy();
  });

  it("refuse un lot sur un coffret", async () => {
    const bundle = await createTestProduct({ stock: 0 });
    await testDb.product.update({
      where: { id: bundle.id },
      data: { kind: "BUNDLE" },
    });

    await expect(
      receiveBatch(testDb, {
        productId: bundle.id, code: "LOT-D", quantity: 5, expiresAt: null, actorId: "admin-test",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuse une quantité nulle ou négative", async () => {
    const p = await createTestProduct({ stock: 0 });
    await expect(
      receiveBatch(testDb, {
        productId: p.id, code: "LOT-E", quantity: 0, expiresAt: null, actorId: "admin-test",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("attribution à la préparation", () => {
  it("refuse un lot qui n'existe pas pour ce produit", async () => {
    // Saisir le lot du sérum sur une ligne de crème donnerait un rappel qui
    // désigne les mauvais clients.
    const p = await createTestProduct({ stock: 10 });
    const order = await shippedOrder(p.id, "client@example.com", null);
    const item = await testDb.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
    });

    await expect(
      assignBatchToOrderItem(testDb, item.id, "LOT-INCONNU", "admin-test"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("attribue un lot existant et le journalise", async () => {
    const p = await createTestProduct({ stock: 0 });
    await receiveBatch(testDb, {
      productId: p.id, code: "LOT-F", quantity: 10, expiresAt: null, actorId: "admin-test",
    });
    const order = await shippedOrder(p.id, "client@example.com", null);
    const item = await testDb.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
    });

    await assignBatchToOrderItem(testDb, item.id, "LOT-F", "admin-test");

    const updated = await testDb.orderItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(updated.batchCode).toBe("LOT-F");

    const log = await testDb.auditLog.findFirstOrThrow({
      where: { entityId: item.id, action: "batch.assign" },
    });
    expect(log.diff).toMatchObject({ lot: "LOT-F" });
  });
});

describe("rappel produit", () => {
  it("liste exactement les clients ayant reçu le lot", async () => {
    const p = await createTestProduct({ stock: 0 });
    await receiveBatch(testDb, {
      productId: p.id, code: "LOT-G", quantity: 50, expiresAt: null, actorId: "admin-test",
    });
    await receiveBatch(testDb, {
      productId: p.id, code: "LOT-H", quantity: 50, expiresAt: null, actorId: "admin-test",
    });

    await shippedOrder(p.id, "concerne@example.com", "LOT-G");
    await shippedOrder(p.id, "autre-lot@example.com", "LOT-H");

    const r = await recallByBatch(testDb, "LOT-G");

    expect(r.affected.map((a) => a.email)).toEqual(["concerne@example.com"]);
    expect(r.untraced).toHaveLength(0);
  });

  it("signale séparément les lignes sans lot renseigné", async () => {
    // Le point critique : une liste qui tairait ces lignes serait rassurante
    // et fausse. On ne peut pas affirmer qu'elles ne contiennent pas le lot.
    const p = await createTestProduct({ stock: 0 });
    await receiveBatch(testDb, {
      productId: p.id, code: "LOT-I", quantity: 50, expiresAt: null, actorId: "admin-test",
    });

    await shippedOrder(p.id, "trace@example.com", "LOT-I");
    await shippedOrder(p.id, "sans-lot@example.com", null);

    const r = await recallByBatch(testDb, "LOT-I");

    expect(r.affected.map((a) => a.email)).toEqual(["trace@example.com"]);
    expect(r.untraced.map((a) => a.email)).toEqual(["sans-lot@example.com"]);
  });

  it("ignore les commandes non expédiées", async () => {
    // Une commande en préparation se corrige, elle ne se rappelle pas.
    const p = await createTestProduct({ stock: 0 });
    await receiveBatch(testDb, {
      productId: p.id, code: "LOT-J", quantity: 50, expiresAt: null, actorId: "admin-test",
    });

    const order = await shippedOrder(p.id, "en-cours@example.com", "LOT-J");
    await testDb.order.update({
      where: { id: order.id },
      data: { status: "PREPARING", shippedAt: null },
    });

    const r = await recallByBatch(testDb, "LOT-J");
    expect(r.affected).toHaveLength(0);
  });

  it("refuse un code de lot inconnu plutôt que de renvoyer une liste vide", async () => {
    // Une liste vide se confondrait avec « personne n'est concerné ».
    await expect(recallByBatch(testDb, "JAMAIS-VU")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("export CSV", () => {
  it("inclut les lignes tracées et non tracées, distinguées", async () => {
    const p = await createTestProduct({ stock: 0 });
    await receiveBatch(testDb, {
      productId: p.id, code: "LOT-K", quantity: 50, expiresAt: null, actorId: "admin-test",
    });
    await shippedOrder(p.id, "trace@example.com", "LOT-K");
    await shippedOrder(p.id, "sans-lot@example.com", null);

    const csv = recallToCsv(await recallByBatch(testDb, "LOT-K"));

    expect(csv).toContain("trace@example.com");
    expect(csv).toContain("sans-lot@example.com");
    expect(csv).toContain("Lot confirmé");
    expect(csv).toContain("Lot inconnu");
  });

  it("s'ouvre correctement dans Excel français", async () => {
    const p = await createTestProduct({ stock: 0 });
    await receiveBatch(testDb, {
      productId: p.id, code: "LOT-L", quantity: 5, expiresAt: null, actorId: "admin-test",
    });
    const csv = recallToCsv(await recallByBatch(testDb, "LOT-L"));

    // BOM UTF-8, sans quoi les accents sont illisibles.
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    // Point-virgule : avec une virgule, tout atterrit dans une seule colonne.
    expect(csv).toContain("Commande;Email;Produit");
  });

  it("échappe les guillemets plutôt que de casser les colonnes", () => {
    const csv = recallToCsv({
      code: "X",
      productName: 'Crème "Légère"',
      affected: [
        {
          orderNumber: "HF-1",
          email: "a@b.c",
          productName: 'Crème "Légère"',
          qty: 1,
          orderedAt: new Date("2026-01-01"),
          shippedAt: null,
        },
      ],
      untraced: [],
    });
    expect(csv).toContain('"Crème ""Légère"""');
  });
});

describe("liste des lots", () => {
  it("renvoie les lots du plus récent au plus ancien", async () => {
    const p = await createTestProduct({ stock: 0 });
    await receiveBatch(testDb, {
      productId: p.id, code: "LOT-M1", quantity: 5, expiresAt: null, actorId: "admin-test",
    });
    await receiveBatch(testDb, {
      productId: p.id, code: "LOT-M2", quantity: 5, expiresAt: null, actorId: "admin-test",
    });

    const list = await listBatches(testDb, p.id);
    expect(list.map((b) => b.code)).toEqual(["LOT-M2", "LOT-M1"]);
  });
});
