import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
  cancelOrder,
  createOrder,
  listOrderEvents,
  transitionOrder,
} from "@/server/services/orders";
import { addItem } from "@/server/services/cart";
import { sellProduct } from "@/server/services/stock";
import type { Address } from "@/lib/validation/address";
import { cleanupTestProducts, createTestProduct, testDb } from "./helpers/db";

/**
 * HEP-55 — annuler, c'est trois choses en même temps : changer l'état, rendre
 * l'argent, rendre le stock. Les trois réussissent, ou aucune.
 */

const ADDRESS: Address = {
  firstName: "Jules",
  lastName: "Forgeron",
  line1: "12 rue de la Forge",
  postalCode: "75011",
  city: "Paris",
  country: "FR",
  phone: "+33612345678",
};

const ADMIN = { kind: "admin", id: "admin-test-jules" } as const;

async function stockOf(id: string) {
  return (await testDb.product.findUniqueOrThrow({ where: { id } })).stock;
}

/** Commande créée depuis un vrai panier, comme en production. */
async function placeOrder(product: { slug: string }, qty = 2) {
  const cartToken = `test-${randomBytes(12).toString("base64url")}`;
  await addItem(testDb, cartToken, product.slug, qty);
  return testDb.$transaction((tx) =>
    createOrder(tx, {
      cartToken,
      email: "jules@example.com",
      shippingAddress: ADDRESS,
    }),
  );
}

/**
 * Encaisse la commande : passage à PAID **et** décrément du stock.
 *
 * C'est ce que fera le webhook Stripe (HEP-59). Les deux vont ensemble — le
 * stock n'est pris qu'au paiement — et l'annulation doit rendre exactement ça.
 */
async function pay(orderId: string, lines: { productId: string; qty: number }[]) {
  await testDb.$transaction(async (tx) => {
    await transitionOrder(tx, { orderId, to: "PAID", actor: ADMIN });
    for (const line of lines) {
      await sellProduct(tx, { ...line, reason: "SALE", orderId });
    }
  });
}

function cancel(orderId: string, overrides: Record<string, unknown> = {}) {
  return testDb.$transaction((tx) =>
    cancelOrder(tx, {
      orderId,
      reason: "Rupture fournisseur",
      actor: ADMIN,
      ...overrides,
    }),
  );
}

async function cleanup() {
  await testDb.order.deleteMany({ where: { email: { endsWith: "@example.com" } } });
  await testDb.cartItem.deleteMany({
    where: { cart: { token: { startsWith: "test-" } } },
  });
  await testDb.cart.deleteMany({ where: { token: { startsWith: "test-" } } });
  await testDb.discount.deleteMany({ where: { code: { startsWith: "TEST-" } } });
  await cleanupTestProducts();
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await testDb.$disconnect();
});

describe("annulation d'une commande payée", () => {
  it("rembourse, remet le stock et prévient le client, en une transaction", async () => {
    // Première definition of done.
    const p = await createTestProduct({ stock: 10 });
    const order = await placeOrder(p, 3);
    await pay(order.id, [{ productId: p.id, qty: 3 }]);

    expect(await stockOf(p.id)).toBe(7);

    const refund = vi.fn(async () => {});
    const result = await cancel(order.id, { refund });

    expect(refund).toHaveBeenCalledOnce();
    expect(await stockOf(p.id)).toBe(10);
    expect(result.email).toBe("commande-annulee");
    expect(result.restocked).toEqual([{ productId: p.id, qty: 3 }]);

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true },
    });
    expect(stored.status).toBe("CANCELED");
  });

  it("stocke le motif dans le journal", async () => {
    const p = await createTestProduct({ stock: 10 });
    const order = await placeOrder(p, 1);
    await pay(order.id, [{ productId: p.id, qty: 1 }]);
    await cancel(order.id, { reason: "Adresse injoignable", refund: async () => {} });

    const journal = await listOrderEvents(testDb, order.id);
    const canceled = journal.find((e) => e.to === "CANCELED");
    expect(canceled?.note).toBe("Adresse injoignable");
    expect(canceled?.from).toBe("PAID");
  });

  it("trace la remise en stock comme un mouvement CANCEL", async () => {
    const p = await createTestProduct({ stock: 10 });
    const order = await placeOrder(p, 2);
    await pay(order.id, [{ productId: p.id, qty: 2 }]);
    await cancel(order.id, { refund: async () => {} });

    const movements = await testDb.stockMovement.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
      select: { reason: true, delta: true, note: true },
    });

    expect(movements.map((m) => m.reason)).toEqual(["SALE", "CANCEL"]);
    expect(movements[1].delta).toBe(2);
    expect(movements[1].note).toContain("Rupture fournisseur");
  });

  it("refuse d'annuler une commande payée sans remboursement", async () => {
    // Annuler en base sans rendre l'argent, c'est une commande disparue et un
    // client débité.
    const p = await createTestProduct({ stock: 10 });
    const order = await placeOrder(p, 1);
    await pay(order.id, [{ productId: p.id, qty: 1 }]);

    await expect(cancel(order.id)).rejects.toThrow(/sans remboursement/i);
    expect(await stockOf(p.id)).toBe(9);
  });
});

describe("le remboursement échoue", () => {
  it("laisse la commande payée, le stock pris et l'erreur remonte", async () => {
    // Deuxième definition of done. Tout est dans la même transaction : l'échec
    // de Stripe emporte l'état, le stock et le journal avec lui.
    const p = await createTestProduct({ stock: 10 });
    const order = await placeOrder(p, 4);
    await pay(order.id, [{ productId: p.id, qty: 4 }]);

    const refund = async () => {
      throw new Error("card_declined");
    };

    await expect(cancel(order.id, { refund })).rejects.toThrow("card_declined");

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true },
    });
    expect(stored.status).toBe("PAID");
    expect(await stockOf(p.id)).toBe(6);

    // Ni entrée au journal, ni mouvement de stock : le rollback a tout emporté.
    const journal = await listOrderEvents(testDb, order.id);
    expect(journal.some((e) => e.to === "CANCELED")).toBe(false);
    const movements = await testDb.stockMovement.findMany({
      where: { orderId: order.id, reason: "CANCEL" },
    });
    expect(movements).toHaveLength(0);
  });
});

describe("commande jamais payée", () => {
  it("s'annule sans remboursement et sans inventer de stock", async () => {
    // Le piège : le stock n'est pris qu'à l'encaissement. « Rendre » le stock
    // d'une commande PENDING créerait des flacons qui n'existent pas, et
    // l'inventaire dériverait sans que rien n'alerte.
    const p = await createTestProduct({ stock: 10 });
    const order = await placeOrder(p, 3);

    const result = await cancel(order.id);

    expect(result.restocked).toEqual([]);
    expect(await stockOf(p.id)).toBe(10);
    expect(await testDb.stockMovement.count({ where: { orderId: order.id } })).toBe(0);
  });
});

describe("après expédition", () => {
  it("refuse l'annulation et renvoie vers le retour", async () => {
    const p = await createTestProduct({ stock: 10 });
    const order = await placeOrder(p, 1);
    await pay(order.id, [{ productId: p.id, qty: 1 }]);
    await testDb.$transaction(async (tx) => {
      await transitionOrder(tx, { orderId: order.id, to: "PREPARING", actor: ADMIN });
      await transitionOrder(tx, { orderId: order.id, to: "SHIPPED", actor: ADMIN });
    });

    await expect(cancel(order.id, { refund: async () => {} })).rejects.toThrow(
      /demande de retour/i,
    );
    expect(await stockOf(p.id)).toBe(9);
  });

  it("refuse une seconde annulation", async () => {
    const p = await createTestProduct({ stock: 10 });
    const order = await placeOrder(p, 1);
    await cancel(order.id);

    await expect(cancel(order.id)).rejects.toThrow(/annulée/i);
  });
});

describe("motif", () => {
  it("est obligatoire", async () => {
    const p = await createTestProduct({ stock: 10 });
    const order = await placeOrder(p, 1);

    await expect(cancel(order.id, { reason: "   " })).rejects.toThrow(/motif/i);
  });
});

describe("coffret", () => {
  it("rend chaque composant, sans repasser par la composition d'aujourd'hui", async () => {
    const [a, b] = await Promise.all([
      createTestProduct({ stock: 5 }),
      createTestProduct({ stock: 5 }),
    ]);
    const bundle = await createTestProduct({ stock: 0 });
    await testDb.product.update({
      where: { id: bundle.id },
      data: { kind: "BUNDLE" },
    });
    await testDb.bundleComponent.createMany({
      data: [a, b].map((p) => ({ bundleId: bundle.id, componentId: p.id, qty: 1 })),
    });

    const order = await placeOrder(bundle, 2);
    await pay(order.id, [{ productId: bundle.id, qty: 2 }]);
    expect(await stockOf(a.id)).toBe(3);

    // La composition change APRÈS la vente. La remise en stock doit rendre ce
    // qui a été pris, pas ce que le coffret contient aujourd'hui.
    await testDb.bundleComponent.deleteMany({
      where: { bundleId: bundle.id, componentId: b.id },
    });

    await cancel(order.id, { refund: async () => {} });

    expect(await stockOf(a.id)).toBe(5);
    expect(await stockOf(b.id)).toBe(5);
  });
});

describe("code promo", () => {
  it("est rendu à son porteur", async () => {
    // Perdre son code parce que la boutique a annulé, c'est le client qui
    // écrit au service client.
    const p = await createTestProduct({ stock: 10 });
    const order = await placeOrder(p, 1);

    const code = `TEST-${randomBytes(4).toString("hex")}`;
    const discount = await testDb.discount.create({
      data: { code, type: "PERCENT", value: 1000, usedCount: 1 },
    });
    await testDb.order.update({
      where: { id: order.id },
      data: { discountCode: code },
    });
    await testDb.discountRedemption.create({
      data: { discountId: discount.id, orderId: order.id, email: "jules@example.com" },
    });

    const result = await cancel(order.id);

    expect(result.releasedDiscountCode).toBe(code);
    const after = await testDb.discount.findUniqueOrThrow({ where: { code } });
    expect(after.usedCount).toBe(0);
    expect(
      await testDb.discountRedemption.count({ where: { orderId: order.id } }),
    ).toBe(0);
  });
});

describe("cycle complet", () => {
  it("laisse le stock juste après commande → annulation → nouvelle commande", async () => {
    // Troisième definition of done. Le contrôle qui compte : la somme des
    // mouvements doit toujours retomber sur le stock courant.
    const p = await createTestProduct({ stock: 10 });

    const first = await placeOrder(p, 3);
    await pay(first.id, [{ productId: p.id, qty: 3 }]);
    await cancel(first.id, { refund: async () => {} });
    expect(await stockOf(p.id)).toBe(10);

    const second = await placeOrder(p, 2);
    await pay(second.id, [{ productId: p.id, qty: 2 }]);
    expect(await stockOf(p.id)).toBe(8);

    const movements = await testDb.stockMovement.findMany({
      where: { productId: p.id, reason: { in: ["SALE", "CANCEL"] } },
      select: { delta: true },
    });
    expect(10 + movements.reduce((n, m) => n + m.delta, 0)).toBe(8);
  });
});
