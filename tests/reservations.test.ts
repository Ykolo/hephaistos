import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  addItem,
  clearCart,
  getCartView,
  releaseExpiredReservations,
  removeItem,
  RESERVATION_MINUTES,
  updateQty,
} from "@/server/services/cart";
import {
  availableUnits,
  reservedQty,
  stockFromMovements,
} from "@/server/services/stock";
import { cleanupTestProducts, createTestProduct, testDb } from "./helpers/db";

function token() {
  return `test-${randomBytes(12).toString("base64url")}`;
}

async function cleanupCarts() {
  await testDb.cartItem.deleteMany({
    where: { cart: { token: { startsWith: "test-" } } },
  });
  await testDb.cart.deleteMany({ where: { token: { startsWith: "test-" } } });
}

beforeEach(async () => {
  await cleanupCarts();
  await cleanupTestProducts();
});

afterAll(async () => {
  await cleanupCarts();
  await cleanupTestProducts();
  await testDb.$disconnect();
});

/** Force l'expiration d'une réservation, sans attendre 30 minutes. */
async function expireReservations(cartToken: string) {
  await testDb.cartItem.updateMany({
    where: { cart: { token: cartToken } },
    data: { reservedUntil: new Date(Date.now() - 1000) },
  });
}

describe("réservation — le client ne se bloque pas lui-même", () => {
  it("peut augmenter la quantité de sa propre ligne", async () => {
    // Le piège central : sans exclusion du panier courant, la réservation de
    // 1 rendrait le passage à 2 impossible sur un stock de 2.
    const t = token();
    const p = await createTestProduct({ stock: 2 });

    await addItem(testDb, t, p.slug, 1);
    await expect(updateQty(testDb, t, p.slug, 2)).resolves.toBeUndefined();

    expect((await getCartView(testDb, t)).itemCount).toBe(2);
  });

  it("voit sa propre ligne comme disponible, pas en rupture", async () => {
    const t = token();
    const p = await createTestProduct({ stock: 3 });
    await addItem(testDb, t, p.slug, 3);

    const view = await getCartView(testDb, t);
    expect(view.hasUnavailableLines).toBe(false);
  });
});

describe("réservation — effet sur les autres clients", () => {
  it("réduit le stock vendable vu par un autre panier", async () => {
    const a = token();
    const p = await createTestProduct({ stock: 5 });

    await addItem(testDb, a, p.slug, 3);

    // Vu de l'extérieur : 5 en stock, 3 réservés, 2 vendables.
    expect(await availableUnits(testDb, p.id)).toBe(2);
    expect(await reservedQty(testDb, p.id)).toBe(3);
  });

  it("empêche un second client de prendre le stock réservé", async () => {
    const a = token();
    const b = token();
    const p = await createTestProduct({ stock: 2 });

    await addItem(testDb, a, p.slug, 2);

    await expect(addItem(testDb, b, p.slug, 1)).rejects.toMatchObject({
      code: "OUT_OF_STOCK",
    });
  });

  it("libère le stock dès que la réservation expire", async () => {
    const a = token();
    const b = token();
    const p = await createTestProduct({ stock: 2 });

    await addItem(testDb, a, p.slug, 2);
    await expireReservations(a);

    // Le second client peut de nouveau acheter, même avant le passage du cron.
    await expect(addItem(testDb, b, p.slug, 1)).resolves.toBeUndefined();
  });
});

describe("réservation — coffret", () => {
  it("réserve les composants, pas le coffret", async () => {
    // Un coffret n'a pas de stock : le réserver doit immobiliser ses
    // composants, sinon on vendrait deux fois le même flacon.
    const t = token();
    const [a, b] = await Promise.all([
      createTestProduct({ stock: 4 }),
      createTestProduct({ stock: 4 }),
    ]);
    const bundle = await createTestProduct({ stock: 0 });
    await testDb.product.update({
      where: { id: bundle.id },
      data: { kind: "BUNDLE", availability: "IN_STOCK" },
    });
    await testDb.bundleComponent.createMany({
      data: [a, b].map((c) => ({
        bundleId: bundle.id,
        componentId: c.id,
        qty: 1,
      })),
    });

    await addItem(testDb, t, bundle.slug, 2);

    expect(await reservedQty(testDb, a.id)).toBe(2);
    expect(await reservedQty(testDb, b.id)).toBe(2);
    // 4 en stock, 2 réservés par le coffret.
    expect(await availableUnits(testDb, a.id)).toBe(2);
  });

  it("tient compte de la quantité requise par composant", async () => {
    const t = token();
    const a = await createTestProduct({ stock: 10 });
    const bundle = await createTestProduct({ stock: 0 });
    await testDb.product.update({
      where: { id: bundle.id },
      data: { kind: "BUNDLE", availability: "IN_STOCK" },
    });
    await testDb.bundleComponent.create({
      data: { bundleId: bundle.id, componentId: a.id, qty: 3 },
    });

    await addItem(testDb, t, bundle.slug, 2);

    // 2 coffrets × 3 unités = 6 réservées.
    expect(await reservedQty(testDb, a.id)).toBe(6);
  });
});

describe("réservation — libération", () => {
  it("le retrait d'une ligne libère sa réservation", async () => {
    const a = token();
    const p = await createTestProduct({ stock: 5 });

    await addItem(testDb, a, p.slug, 3);
    expect(await reservedQty(testDb, p.id)).toBe(3);

    await removeItem(testDb, a, p.slug);
    expect(await reservedQty(testDb, p.id)).toBe(0);
    expect(await availableUnits(testDb, p.id)).toBe(5);
  });

  it("vider le panier libère tout", async () => {
    const a = token();
    const [x, y] = await Promise.all([
      createTestProduct({ stock: 5 }),
      createTestProduct({ stock: 5 }),
    ]);

    await addItem(testDb, a, x.slug, 2);
    await addItem(testDb, a, y.slug, 3);

    await clearCart(testDb, a);
    expect(await reservedQty(testDb, x.id)).toBe(0);
    expect(await reservedQty(testDb, y.id)).toBe(0);
  });

  it("baisser la quantité ne libère que l'écart", async () => {
    const a = token();
    const p = await createTestProduct({ stock: 10 });

    await addItem(testDb, a, p.slug, 5);
    await updateQty(testDb, a, p.slug, 2);

    expect(await reservedQty(testDb, p.id)).toBe(2);
  });
});

describe("cron — libération des réservations échues", () => {
  it("libère une réservation expirée et conserve la ligne", async () => {
    const a = token();
    const p = await createTestProduct({ stock: 5 });
    await addItem(testDb, a, p.slug, 3);
    await expireReservations(a);

    const result = await releaseExpiredReservations(testDb);

    expect(result.released).toBe(1);
    expect(result.units).toBe(3);
    expect(await reservedQty(testDb, p.id)).toBe(0);

    // La ligne reste : le client qui revient retrouve son panier.
    expect((await getCartView(testDb, a)).itemCount).toBe(3);
  });

  it("ne touche pas aux réservations encore valides", async () => {
    const a = token();
    const p = await createTestProduct({ stock: 5 });
    await addItem(testDb, a, p.slug, 2);

    const result = await releaseExpiredReservations(testDb);
    expect(result.released).toBe(0);
    expect(await reservedQty(testDb, p.id)).toBe(2);
  });

  it("est idempotent : un second passage ne libère rien de plus", async () => {
    // Le cron tourne toutes les 5 minutes ; un double passage ne doit pas
    // faire apparaître du stock qui n'existe pas.
    const a = token();
    const p = await createTestProduct({ stock: 5 });
    await addItem(testDb, a, p.slug, 3);
    await expireReservations(a);

    await releaseExpiredReservations(testDb);
    const second = await releaseExpiredReservations(testDb);

    expect(second.released).toBe(0);
    expect(await availableUnits(testDb, p.id)).toBe(5);
  });

  it("retirer une ligne déjà libérée ne double pas la libération", async () => {
    const a = token();
    const p = await createTestProduct({ stock: 5 });
    await addItem(testDb, a, p.slug, 3);
    await expireReservations(a);
    await releaseExpiredReservations(testDb);

    await removeItem(testDb, a, p.slug);

    // Toujours 5 : la libération ne doit pas être comptée deux fois.
    expect(await availableUnits(testDb, p.id)).toBe(5);
  });
});

describe("réservation — cohérence de l'historique", () => {
  it("les mouvements RESERVE et RELEASE n'altèrent pas le stock reconstitué", async () => {
    // Invariant de HEP-41 : la somme des mouvements doit égaler Product.stock.
    // Une réservation ne déplace aucun flacon, elle ne doit donc pas compter.
    const a = token();
    const p = await createTestProduct({ stock: 0 });

    await testDb.product.update({ where: { id: p.id }, data: { stock: 8 } });
    await addItem(testDb, a, p.slug, 4);
    await updateQty(testDb, a, p.slug, 2);
    await removeItem(testDb, a, p.slug);

    // Des mouvements de réservation ont bien été écrits…
    const reservationMoves = await testDb.stockMovement.count({
      where: { productId: p.id, reason: { in: ["RESERVE", "RELEASE"] } },
    });
    expect(reservationMoves).toBeGreaterThan(0);

    // …mais ils sont exclus du contrôle de cohérence.
    expect(await stockFromMovements(testDb, p.id)).toBe(0);
  });

  it("trace la réservation avec le panier concerné", async () => {
    const a = token();
    const p = await createTestProduct({ stock: 5 });
    await addItem(testDb, a, p.slug, 2);

    const move = await testDb.stockMovement.findFirstOrThrow({
      where: { productId: p.id, reason: "RESERVE" },
    });
    expect(move.delta).toBe(-2);
    expect(move.note).toContain("Panier");
  });
});

describe("réservation — durée", () => {
  it("dure 30 minutes et se prolonge à chaque interaction", async () => {
    expect(RESERVATION_MINUTES).toBe(30);

    const a = token();
    const p = await createTestProduct({ stock: 10 });
    await addItem(testDb, a, p.slug, 1);
    const first = await testDb.cartItem.findFirstOrThrow({
      where: { cart: { token: a } },
    });

    await new Promise((r) => setTimeout(r, 20));
    await addItem(testDb, a, p.slug, 1);
    const second = await testDb.cartItem.findFirstOrThrow({
      where: { cart: { token: a } },
    });

    expect(second.reservedUntil!.getTime()).toBeGreaterThan(
      first.reservedUntil!.getTime(),
    );
  });
});
