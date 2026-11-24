import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { createOrder } from "@/server/services/orders";
import { addItem, applyDiscountCode, getCartView, removeItem, updateQty } from "@/server/services/cart";
import {
  redeemDiscount,
  saveDiscount,
  setDiscountActive,
  validateDiscount,
  type DiscountRow,
} from "@/server/services/discounts";
import { ActionError } from "@/server/errors";
import { discountRefusalMessage, type DiscountRefusal } from "@/lib/discounts";
import { parisDayStart } from "@/lib/dates";
import type { Address } from "@/lib/validation/address";
import { cleanupTestProducts, createTestProduct, testDb } from "./helpers/db";

/**
 * HEP-75 — « un code promo expiré, déjà utilisé, ou sous le minimum est bien
 * refusé », le compteur n'avance qu'au paiement, et un code à usage unique ne
 * passe qu'une fois, même tenté en même temps par vingt clients.
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

const ADMIN_ID = "admin-test-discounts";

function code(): string {
  return `TEST-${randomBytes(4).toString("hex").toUpperCase()}`;
}

async function discount(data: Partial<Parameters<typeof testDb.discount.create>[0]["data"]> = {}) {
  return testDb.discount.create({
    data: { code: code(), type: "PERCENT", value: 1000, ...data },
  });
}

async function cart(slug: string, qty = 1) {
  const token = `test-${randomBytes(12).toString("base64url")}`;
  await addItem(testDb, token, slug, qty);
  return token;
}

function order(token: string, email: string) {
  return testDb.$transaction(
    (tx) => createOrder(tx, { cartToken: token, email, shippingAddress: ADDRESS }),
    { maxWait: 30_000, timeout: 30_000 },
  );
}

async function refusalOf(promise: Promise<unknown>): Promise<ActionError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ActionError);
  return error as ActionError;
}

async function cleanup() {
  await testDb.order.deleteMany({ where: { email: { endsWith: "@example.com", mode: "insensitive" } } });
  await testDb.cartItem.deleteMany({ where: { cart: { token: { startsWith: "test-" } } } });
  await testDb.cart.deleteMany({ where: { token: { startsWith: "test-" } } });
  await testDb.discount.deleteMany({ where: { code: { startsWith: "TEST-" } } });
  await testDb.auditLog.deleteMany({ where: { actorId: ADMIN_ID } });
  await cleanupTestProducts();
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await testDb.$disconnect();
});

describe("validateDiscount — fonction pure", () => {
  const now = new Date("2026-12-10T12:00:00Z");
  const lines = [{ productId: "p1", qty: 2, unitPriceCents: 2000 }];
  const row = (over: Partial<DiscountRow> = {}): DiscountRow => ({
    id: "d1",
    code: "NOEL",
    type: "PERCENT",
    value: 1000,
    minOrderCents: null,
    productId: null,
    startsAt: null,
    endsAt: null,
    maxUses: null,
    maxUsesPerCustomer: 1,
    usedCount: 0,
    active: true,
    ...over,
  });
  const reason = (r: ReturnType<typeof validateDiscount>) => (r.ok ? "OK" : r.reason);

  it("accepte un code valable", () => {
    expect(reason(validateDiscount(row(), { now, lines }))).toBe("OK");
  });

  it("chaque refus a son motif, et son message à lui", () => {
    const cases: [DiscountRefusal, ReturnType<typeof validateDiscount>][] = [
      ["UNKNOWN", validateDiscount(null, { now, lines })],
      ["NOT_STARTED", validateDiscount(row({ startsAt: new Date("2026-12-11T00:00:00Z") }), { now, lines })],
      ["EXPIRED", validateDiscount(row({ endsAt: new Date("2026-12-10T12:00:00Z") }), { now, lines })],
      ["EXHAUSTED", validateDiscount(row({ maxUses: 5, usedCount: 5 }), { now, lines })],
      ["ALREADY_USED", validateDiscount(row(), { now, lines, usage: { byCustomer: 1 } })],
      ["BELOW_MINIMUM", validateDiscount(row({ minOrderCents: 6000 }), { now, lines })],
      ["NOT_APPLICABLE", validateDiscount(row({ productId: "absent" }), { now, lines })],
    ];
    for (const [expected, result] of cases) expect(reason(result)).toBe(expected);

    // Les quatre messages de l'issue sont distincts deux à deux.
    const messages = cases.map(([, r]) => (r.ok ? "" : r.message));
    expect(new Set(messages).size).toBe(messages.length);
    // Le montant figure dans le message (l'espace avant « € » est insécable).
    expect(messages[5]).toMatch(/^Ce code s'applique dès 60\s€ d'achat\.$/u);
  });

  it("un code désactivé répond exactement comme un code inconnu", () => {
    expect(validateDiscount(row({ active: false }), { now, lines })).toEqual(
      validateDiscount(null, { now, lines }),
    );
  });

  it("les places en cours de paiement chez d'autres clients comptent contre la limite", () => {
    expect(reason(validateDiscount(row({ maxUses: 1 }), { now, lines, usage: { pendingByOthers: 1 } }))).toBe(
      "EXHAUSTED",
    );
  });
});

describe("saisie du code dans le panier", () => {
  it("accepte le code tapé en minuscules et avec des espaces, et l'applique", async () => {
    const p = await createTestProduct({ stock: 10 });
    const d = await discount();
    const token = await cart(p.slug, 2);

    await applyDiscountCode(testDb, token, ` ${d.code.toLowerCase().replace("-", "- ")} `);
    const view = await getCartView(testDb, token);

    expect(view.discount?.code).toBe(d.code);
    expect(view.totals.discountCents).toBe(400); // 10 % de 40 €
    expect(view.totals.totalCents).toBe(3600);
  });

  it("refuse un code expiré, avec son code d'erreur et son message", async () => {
    const p = await createTestProduct({ stock: 10 });
    const d = await discount({ endsAt: new Date(Date.now() - 1000) });
    const token = await cart(p.slug);

    const error = await refusalOf(applyDiscountCode(testDb, token, d.code));
    expect(error.code).toBe("DISCOUNT_EXPIRED");
    expect(error.message).toBe(discountRefusalMessage("EXPIRED"));
    expect((await getCartView(testDb, token)).discount).toBeNull();
  });

  it("refuse sous le minimum, et sur un panier sans le produit ciblé", async () => {
    const p = await createTestProduct({ stock: 10 });
    const other = await createTestProduct({ stock: 10 });
    const min = await discount({ minOrderCents: 5000 });
    const targeted = await discount({ productId: other.id });
    const token = await cart(p.slug, 1);

    expect((await refusalOf(applyDiscountCode(testDb, token, min.code))).message).toBe(
      discountRefusalMessage("BELOW_MINIMUM", { minOrderCents: 5000 }),
    );
    expect((await refusalOf(applyDiscountCode(testDb, token, targeted.code))).message).toBe(
      discountRefusalMessage("NOT_APPLICABLE"),
    );
  });

  it("refuse au client connecté un code qu'il a déjà utilisé", async () => {
    const p = await createTestProduct({ stock: 10 });
    const d = await discount();
    const paid = await order(await cartWithCode(p.slug, d.code), "Ada@Example.com");
    await testDb.$transaction((tx) => redeemDiscount(tx, paid.id));

    const token = await cart(p.slug);
    const error = await refusalOf(applyDiscountCode(testDb, token, d.code, { email: "ada@example.com" }));
    expect(error.code).toBe("DISCOUNT_ALREADY_USED");
  });

  it("un seul code par panier : le second remplace le premier", async () => {
    const p = await createTestProduct({ stock: 10 });
    const first = await discount({ value: 1000 });
    const second = await discount({ value: 2000 });
    const token = await cart(p.slug, 1);

    await applyDiscountCode(testDb, token, first.code);
    await applyDiscountCode(testDb, token, second.code);
    const view = await getCartView(testDb, token);

    expect(view.discount?.code).toBe(second.code);
    expect(view.totals.discountCents).toBe(400);
  });

  it("passer sous le minimum garde le code, l'affiche avec le motif, et le réapplique ensuite", async () => {
    const p = await createTestProduct({ stock: 10 });
    const d = await discount({ type: "FIXED", value: 500, minOrderCents: 4000 });
    const token = await cart(p.slug, 2);
    await applyDiscountCode(testDb, token, d.code);

    await updateQty(testDb, token, p.slug, 1);
    const below = await getCartView(testDb, token);
    expect(below.totals.discountCents).toBe(0);
    expect(below.discount?.message).toBe(discountRefusalMessage("BELOW_MINIMUM", { minOrderCents: 4000 }));
    // Le code reste jugé valable : le navigateur peut réappliquer la remise
    // pendant la mise à jour optimiste.
    expect(below.discount?.pricing?.code).toBe(d.code);

    await updateQty(testDb, token, p.slug, 2);
    expect((await getCartView(testDb, token)).totals.discountCents).toBe(500);
  });

  it("un code suspendu depuis la saisie n'est plus appliqué", async () => {
    const p = await createTestProduct({ stock: 10 });
    const d = await discount();
    const token = await cart(p.slug, 1);
    await applyDiscountCode(testDb, token, d.code);
    await testDb.discount.update({ where: { id: d.id }, data: { active: false } });

    const view = await getCartView(testDb, token);
    expect(view.totals.discountCents).toBe(0);
    expect(view.discount?.pricing).toBeNull();
    expect(view.discount?.message).toBe(discountRefusalMessage("UNKNOWN"));
  });
});

async function cartWithCode(slug: string, discountCode: string, qty = 1) {
  const token = await cart(slug, qty);
  await applyDiscountCode(testDb, token, discountCode);
  return token;
}

describe("revalidation au checkout", () => {
  it("un code expiré entre la saisie et le paiement bloque la commande", async () => {
    const p = await createTestProduct({ stock: 10 });
    const d = await discount();
    const token = await cartWithCode(p.slug, d.code);
    await testDb.discount.update({ where: { id: d.id }, data: { endsAt: new Date(Date.now() - 1000) } });

    const error = await refusalOf(order(token, "jules@example.com"));
    expect(error.code).toBe("DISCOUNT_EXPIRED");
    expect(await testDb.order.count({ where: { email: "jules@example.com" } })).toBe(0);
  });

  it("la remise figée sur la commande est celle du panier", async () => {
    const p = await createTestProduct({ stock: 10 });
    const d = await discount({ type: "FIXED", value: 700 });
    const token = await cartWithCode(p.slug, d.code, 2);

    const created = await order(token, "jules@example.com");
    const saved = await testDb.order.findUniqueOrThrow({ where: { id: created.id } });
    expect(saved.discountCode).toBe(d.code);
    expect(saved.discountCents).toBe(700);
    expect(saved.totalCents).toBe(4000 - 700);
  });

  it("un code à usage unique ne passe qu'une fois, même tenté par vingt clients à la fois", async () => {
    const p = await createTestProduct({ stock: 100 });
    const d = await discount({ maxUses: 1 });
    const tokens = await Promise.all(
      Array.from({ length: 20 }, () => cartWithCode(p.slug, d.code)),
    );

    const results = await Promise.allSettled(
      tokens.map((t, i) => order(t, `client${i}@example.com`)),
    );

    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(19);
    for (const r of lost) {
      expect(r.reason).toBeInstanceOf(ActionError);
      expect((r.reason as ActionError).code).toBe("DISCOUNT_ALREADY_USED");
    }
    expect(await testDb.order.count({ where: { discountCode: d.code } })).toBe(1);

    // Personne n'a encore payé : le compteur n'a pas bougé.
    expect((await testDb.discount.findUniqueOrThrow({ where: { id: d.id } })).usedCount).toBe(0);
  });

  it("le client qui relance son propre paiement n'est pas bloqué par sa commande abandonnée", async () => {
    const p = await createTestProduct({ stock: 10 });
    const d = await discount({ maxUses: 1 });
    await order(await cartWithCode(p.slug, d.code), "jules@example.com");

    await expect(order(await cartWithCode(p.slug, d.code), "JULES@example.com")).resolves.toBeDefined();
    await refusalOf(order(await cartWithCode(p.slug, d.code), "autre@example.com"));
  });

  it("une commande en attente depuis plus que la durée d'une session Stripe libère sa place", async () => {
    const p = await createTestProduct({ stock: 10 });
    const d = await discount({ maxUses: 1 });
    const first = await order(await cartWithCode(p.slug, d.code), "jules@example.com");
    await testDb.order.update({
      where: { id: first.id },
      data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    await expect(order(await cartWithCode(p.slug, d.code), "autre@example.com")).resolves.toBeDefined();
  });
});

describe("consommation au paiement", () => {
  it("n'incrémente qu'une fois, même si le webhook est rejoué", async () => {
    const p = await createTestProduct({ stock: 10 });
    const d = await discount();
    const created = await order(await cartWithCode(p.slug, d.code), "jules@example.com");

    const first = await testDb.$transaction((tx) => redeemDiscount(tx, created.id));
    const replay = await testDb.$transaction((tx) => redeemDiscount(tx, created.id));

    expect(first).toEqual({ redeemed: true, overLimit: false });
    expect(replay).toEqual({ redeemed: false, overLimit: false });
    expect((await testDb.discount.findUniqueOrThrow({ where: { id: d.id } })).usedCount).toBe(1);
    expect(await testDb.discountRedemption.count({ where: { discountId: d.id } })).toBe(1);
  });

  it("une commande sans code ne touche à rien", async () => {
    const p = await createTestProduct({ stock: 10 });
    const created = await order(await cart(p.slug), "jules@example.com");
    expect(await testDb.$transaction((tx) => redeemDiscount(tx, created.id))).toBeNull();
  });

  it("le code payé une fois est refusé au checkout suivant du même client, casse ignorée", async () => {
    const p = await createTestProduct({ stock: 10 });
    const d = await discount();
    const created = await order(await cartWithCode(p.slug, d.code), "jules@example.com");
    await testDb.$transaction((tx) => redeemDiscount(tx, created.id));
    await testDb.order.update({ where: { id: created.id }, data: { status: "PAID" } });

    const error = await refusalOf(order(await cartWithCode(p.slug, d.code), "Jules@Example.com"));
    expect(error.code).toBe("DISCOUNT_ALREADY_USED");
  });
});

describe("administration", () => {
  const base = {
    id: null,
    type: "PERCENT" as const,
    value: 1500,
    minOrderCents: null,
    productSlug: null,
    startsAt: null,
    endsAt: null,
    maxUses: null,
    maxUsesPerCustomer: 1,
    active: true,
  };

  it("crée un code, refuse un doublon, et journalise", async () => {
    const c = code();
    const { id, created } = await testDb.$transaction((tx) => saveDiscount(tx, { ...base, code: c }, ADMIN_ID));
    expect(created).toBe(true);

    const dup = await refusalOf(testDb.$transaction((tx) => saveDiscount(tx, { ...base, code: c }, ADMIN_ID)));
    expect(dup.fields?.code).toBe("Ce code existe déjà.");

    const log = await testDb.auditLog.findMany({ where: { entity: "Discount", entityId: id } });
    expect(log.map((l) => l.action)).toEqual(["create"]);
  });

  it("le code lui-même ne change plus après création", async () => {
    const c = code();
    const { id } = await testDb.$transaction((tx) => saveDiscount(tx, { ...base, code: c }, ADMIN_ID));
    const error = await refusalOf(
      testDb.$transaction((tx) => saveDiscount(tx, { ...base, id, code: code() }, ADMIN_ID)),
    );
    expect(error.fields?.code).toBeDefined();
  });

  it("un code suspendu répond comme un code inconnu, et la suspension est journalisée", async () => {
    const p = await createTestProduct({ stock: 10 });
    const c = code();
    const { id } = await testDb.$transaction((tx) => saveDiscount(tx, { ...base, code: c }, ADMIN_ID));
    await testDb.$transaction((tx) => setDiscountActive(tx, id, false, ADMIN_ID));

    const error = await refusalOf(applyDiscountCode(testDb, await cart(p.slug), c));
    expect(error.message).toBe(discountRefusalMessage("UNKNOWN"));
    expect(
      await testDb.auditLog.count({ where: { entity: "Discount", entityId: id, action: "deactivate" } }),
    ).toBe(1);
  });

  it("« jusqu'au 31 » vaut jusqu'à minuit à Paris", () => {
    // Hiver : Paris = UTC+1, le 1er janvier commence à 23 h UTC le 31.
    expect(parisDayStart("2027-01-01").toISOString()).toBe("2026-12-31T23:00:00.000Z");
    // Été : UTC+2.
    expect(parisDayStart("2027-07-01").toISOString()).toBe("2027-06-30T22:00:00.000Z");
  });
});

// `removeItem` garde la même sémantique avec un code posé : la ligne part, le
// code reste et se juge sur ce qui reste.
describe("panier vidé d'un produit ciblé", () => {
  it("le code ciblé reste posé mais ne s'applique plus", async () => {
    const p = await createTestProduct({ stock: 10 });
    const other = await createTestProduct({ stock: 10 });
    const d = await discount({ productId: p.id });
    const token = await cart(p.slug, 1);
    await addItem(testDb, token, other.slug, 1);
    await applyDiscountCode(testDb, token, d.code);

    expect((await getCartView(testDb, token)).totals.discountCents).toBe(200);
    await removeItem(testDb, token, p.slug);
    const view = await getCartView(testDb, token);
    expect(view.totals.discountCents).toBe(0);
    expect(view.discount?.message).toBe(discountRefusalMessage("NOT_APPLICABLE"));
  });
});
