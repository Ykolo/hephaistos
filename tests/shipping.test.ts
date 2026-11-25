import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { addItem, getCartView, updateQty } from "@/server/services/cart";
import { createOrder } from "@/server/services/orders";
import {
  deleteShippingRate,
  saveShippingRate,
  setCartShippingMethod,
} from "@/server/services/shipping";
import { ActionError } from "@/server/errors";
import {
  PACKAGING_GRAMS,
  parcelWeightGrams,
  priceCart,
  rateFor,
  shippingOptions,
  type ShippingRateView,
} from "@/lib/shipping";
import { shippingRateFormSchema } from "@/lib/validation/shipping";
import type { Address } from "@/lib/validation/address";
import {
  chooseTestShipping,
  cleanupTestProducts,
  createTestProduct,
  testDb,
  withTestShippingGrid,
} from "./helpers/db";

/**
 * Grille de port (HEP-70).
 *
 * Grille de test (`TEST_SHIPPING_GRID`) : domicile 5,90 € jusqu'à 500 g et
 * 9,90 € jusqu'à 2 kg, sans franco ; point relais 4,50 € jusqu'à 1 kg, offert
 * dès 60 €. Un produit de test pèse 100 g et coûte 20 €.
 */

withTestShippingGrid();

const ADDRESS: Address = {
  firstName: "Jules",
  lastName: "Martin",
  line1: "12 rue de la Paix",
  postalCode: "75002",
  city: "Paris",
  country: "FR",
  phone: "+33612345678",
};

const ACTOR = "admin-test-shipping";

function token() {
  return `test-${randomBytes(12).toString("base64url")}`;
}

async function cartWith(slug: string, qty = 1) {
  const t = token();
  await addItem(testDb, t, slug, qty);
  return t;
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
  await testDb.order.deleteMany({ where: { email: { endsWith: "@example.com" } } });
  await testDb.cart.deleteMany({ where: { token: { startsWith: "test-" } } });
  await cleanupTestProducts();
  await testDb.auditLog.deleteMany({ where: { actorId: ACTOR } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await testDb.$disconnect();
});

// --- Le calcul, sans base ----------------------------------------------------

const GRID: ShippingRateView[] = [
  { carrier: "colissimo", method: "HOME", maxWeightGrams: 250, priceCents: 549, freeAboveCents: 4900 },
  { carrier: "colissimo", method: "HOME", maxWeightGrams: 500, priceCents: 749, freeAboveCents: 4900 },
  { carrier: "colissimo", method: "HOME", maxWeightGrams: 1000, priceCents: 949, freeAboveCents: 4900 },
  { carrier: "mondial_relay", method: "PICKUP_POINT", maxWeightGrams: 500, priceCents: 449, freeAboveCents: 3900 },
  { carrier: "mondial_relay", method: "PICKUP_POINT", maxWeightGrams: 1000, priceCents: 499, freeAboveCents: 3900 },
];

const line = (unitPriceCents: number, qty: number, weightGrams: number, productId = "p") => ({
  productId,
  qty,
  unitPriceCents,
  weightGrams,
});

describe("poids du colis", () => {
  it("additionne les produits et ajoute l'emballage une seule fois", () => {
    expect(parcelWeightGrams([{ qty: 2, weightGrams: 80 }, { qty: 1, weightGrams: 200 }])).toBe(
      360 + PACKAGING_GRAMS,
    );
  });

  it("un panier vide ne pèse rien, emballage compris", () => {
    expect(parcelWeightGrams([])).toBe(0);
  });
});

describe("choix de la tranche", () => {
  it("le montant est juste pour chaque combinaison poids × mode", () => {
    // Definition of done : on balaie les bornes, de part et d'autre.
    const expected: [number, "HOME" | "PICKUP_POINT", number | null][] = [
      [1, "HOME", 549],
      [250, "HOME", 549], // borne incluse
      [251, "HOME", 749],
      [500, "HOME", 749],
      [501, "HOME", 949],
      [1000, "HOME", 949],
      [1001, "HOME", null], // au-delà de la dernière tranche : pas proposé
      [1, "PICKUP_POINT", 449],
      [500, "PICKUP_POINT", 449],
      [501, "PICKUP_POINT", 499],
      [1000, "PICKUP_POINT", 499],
      [1001, "PICKUP_POINT", null],
    ];
    for (const [weight, method, price] of expected) {
      expect(rateFor(GRID, method, weight)?.priceCents ?? null, `${method} à ${weight} g`).toBe(price);
    }
  });

  it("l'ordre des tranches en base n'a aucune importance", () => {
    const shuffled = [...GRID].reverse();
    expect(rateFor(shuffled, "HOME", 300)?.maxWeightGrams).toBe(500);
  });

  it("propose le point relais d'abord, et seulement les modes qui acceptent le poids", () => {
    expect(shippingOptions(GRID, 400).map((o) => o.method)).toEqual(["PICKUP_POINT", "HOME"]);
    expect(shippingOptions(GRID, 1200)).toEqual([]);
  });
});

describe("seuil de livraison offerte", () => {
  it("se déclenche au montant exact", () => {
    // 49,00 € pile : offerte. 48,99 € : payante.
    const at = priceCart({ lines: [line(4900, 1, 100)], discount: null, rates: GRID, method: "HOME" });
    expect(at.totals.shippingCents).toBe(0);
    expect(at.totals.freeShipping).toBe(true);

    const below = priceCart({ lines: [line(4899, 1, 100)], discount: null, rates: GRID, method: "HOME" });
    expect(below.totals.shippingCents).toBe(549);
  });

  it("se juge après remise : −20 % sur 55 € laisse 44 €, le port reste dû", () => {
    // L'exemple de l'issue. Sans cette règle, la marge disparaît deux fois.
    const r = priceCart({
      lines: [line(5500, 1, 100)],
      discount: { code: "MOINS20", type: "PERCENT", value: 2000 },
      rates: GRID,
      method: "HOME",
    });
    expect(r.totals.discountCents).toBe(1100);
    expect(r.totals.shippingCents).toBe(549);
    expect(r.totals.totalCents).toBe(4400 + 549);
    expect(r.shipping.freeShippingHint).toEqual({ remainingCents: 500, method: null });
  });

  it("« Plus que 12 € » : le reste à atteindre sur le mode choisi", () => {
    const r = priceCart({ lines: [line(3700, 1, 100)], discount: null, rates: GRID, method: "HOME" });
    expect(r.shipping.freeShippingHint).toEqual({ remainingCents: 1200, method: null });
  });

  it("sans choix, le seuil le plus proche, avec son mode quand les seuils diffèrent", () => {
    const r = priceCart({ lines: [line(3000, 1, 100)], discount: null, rates: GRID, method: null });
    expect(r.totals.shippingKnown).toBe(false);
    expect(r.shipping.freeShippingHint).toEqual({ remainingCents: 900, method: "PICKUP_POINT" });
  });

  it("aucun message quand le port est déjà offert par un code", () => {
    const r = priceCart({
      lines: [line(2000, 1, 100)],
      discount: { code: "PORT", type: "FREE_SHIPPING", value: 0 },
      rates: GRID,
      method: "HOME",
    });
    expect(r.totals.shippingCents).toBe(0);
    expect(r.shipping.freeShippingHint).toBeNull();
  });
});

// --- Le panier ---------------------------------------------------------------

describe("panier", () => {
  it("affiche les modes, puis le total livraison comprise une fois le mode choisi", async () => {
    const p = await createTestProduct({ stock: 10 });
    const t = await cartWith(p.slug, 1); // 250 g, 20 €

    const before = await getCartView(testDb, t);
    expect(before.shipping.options.map((o) => [o.method, o.priceCents])).toEqual([
      ["PICKUP_POINT", 450],
      ["HOME", 590],
    ]);
    expect(before.totals.shippingKnown).toBe(false);
    expect(before.shipping.freeShippingHint).toEqual({ remainingCents: 4000, method: "PICKUP_POINT" });

    await setCartShippingMethod(testDb, t, "PICKUP_POINT");
    const after = await getCartView(testDb, t);
    expect(after.totals.shippingKnown).toBe(true);
    expect(after.totals.shippingCents).toBe(450);
    expect(after.totals.totalCents).toBe(2450);
  });

  it("le franco du point relais tombe à 60 € de produits", async () => {
    const p = await createTestProduct({ stock: 10 });
    const t = await cartWith(p.slug, 3);
    await setCartShippingMethod(testDb, t, "PICKUP_POINT");

    const view = await getCartView(testDb, t);
    expect(view.totals.shippingCents).toBe(0);
    expect(view.totals.freeShipping).toBe(true);
    expect(view.shipping.freeShippingHint).toBeNull();
  });

  it("refuse un mode qui n'accepte pas le poids du colis", async () => {
    const p = await createTestProduct({ stock: 20 });
    const t = await cartWith(p.slug, 10); // 1 150 g : au-delà du point relais
    const error = await refusalOf(setCartShippingMethod(testDb, t, "PICKUP_POINT"));
    expect(error.code).toBe("SHIPPING_UNAVAILABLE");

    await setCartShippingMethod(testDb, t, "HOME");
    expect((await getCartView(testDb, t)).totals.shippingCents).toBe(990);
  });

  it("un colis devenu trop lourd signale le mode choisi et bloque la commande", async () => {
    const p = await createTestProduct({ stock: 20 });
    const t = await cartWith(p.slug, 2);
    await setCartShippingMethod(testDb, t, "PICKUP_POINT");
    await updateQty(testDb, t, p.slug, 10);

    const view = await getCartView(testDb, t);
    expect(view.shipping.methodUnavailable).toBe(true);
    expect(view.totals.shippingKnown).toBe(false);

    const error = await refusalOf(
      testDb.$transaction((tx) =>
        createOrder(tx, { cartToken: t, email: "jules@example.com", shippingAddress: ADDRESS }),
      ),
    );
    expect(error.code).toBe("SHIPPING_UNAVAILABLE");
  });

  it("un colis trop lourd pour tous les modes n'en propose aucun", async () => {
    const p = await createTestProduct({ stock: 20 });
    await testDb.product.update({ where: { id: p.id }, data: { weightGrams: 500 } });
    const t = await cartWith(p.slug, 4); // 2 150 g
    expect((await getCartView(testDb, t)).shipping.options).toEqual([]);
  });

  it("refuse un panier vide", async () => {
    const error = await refusalOf(setCartShippingMethod(testDb, token(), "HOME"));
    expect(error.code).toBe("NOT_FOUND");
  });
});

// --- La commande -------------------------------------------------------------

describe("commande", () => {
  it("sans mode de livraison, aucune commande", async () => {
    const p = await createTestProduct({ stock: 10 });
    const t = await cartWith(p.slug, 1);
    const error = await refusalOf(
      testDb.$transaction((tx) =>
        createOrder(tx, { cartToken: t, email: "jules@example.com", shippingAddress: ADDRESS }),
      ),
    );
    expect(error.code).toBe("SHIPPING_UNAVAILABLE");
    expect(error.message).toBe("Choisissez un mode de livraison.");
  });

  it("fige le mode, le transporteur et le port ; changer la grille ensuite n'y touche pas", async () => {
    const p = await createTestProduct({ stock: 10 });
    const t = await cartWith(p.slug, 1);
    await chooseTestShipping(t, "HOME");

    const cartView = await getCartView(testDb, t);
    const created = await testDb.$transaction((tx) =>
      createOrder(tx, { cartToken: t, email: "jules@example.com", shippingAddress: ADDRESS }),
    );
    // Au centime ce que le panier affichait.
    expect(created.totals.totalCents).toBe(cartView.totals.totalCents);

    await testDb.shippingRate.update({
      where: { method_maxWeightGrams: { method: "HOME", maxWeightGrams: 500 } },
      data: { priceCents: 1990 },
    });

    const saved = await testDb.order.findUniqueOrThrow({ where: { id: created.id } });
    expect(saved.shippingMethod).toBe("HOME");
    expect(saved.shippingCarrier).toBe("colissimo");
    expect(saved.shippingCents).toBe(590);
    expect(saved.totalCents).toBe(2590);

    await testDb.shippingRate.update({
      where: { method_maxWeightGrams: { method: "HOME", maxWeightGrams: 500 } },
      data: { priceCents: 590 },
    });
  });
});

// --- L'administration --------------------------------------------------------

describe("administration de la grille", () => {
  const base = {
    id: null,
    carrier: "colissimo",
    method: "HOME" as const,
    maxWeightGrams: 5000,
    priceCents: 1690,
    freeAboveCents: null,
    active: true,
  };

  it("une nouvelle tranche s'applique aussitôt au panier, et entre au journal", async () => {
    const p = await createTestProduct({ stock: 20 });
    await testDb.product.update({ where: { id: p.id }, data: { weightGrams: 500 } });
    const t = await cartWith(p.slug, 4); // 2 150 g : aucun mode jusqu'ici

    const { id, created } = await testDb.$transaction((tx) => saveShippingRate(tx, base, ACTOR));
    expect(created).toBe(true);

    const view = await getCartView(testDb, t);
    expect(view.shipping.options.map((o) => [o.method, o.priceCents])).toEqual([["HOME", 1690]]);

    const log = await testDb.auditLog.findFirst({ where: { entity: "ShippingRate", entityId: id } });
    expect(log?.action).toBe("create");

    await testDb.$transaction((tx) => deleteShippingRate(tx, id, ACTOR));
    expect(await testDb.shippingRate.findUnique({ where: { id } })).toBeNull();
    const deleted = await testDb.auditLog.findFirst({
      where: { entity: "ShippingRate", entityId: id, action: "delete" },
    });
    expect(deleted?.diff).toMatchObject({ priceCents: 1690, maxWeightGrams: 5000 });
  });

  it("modifier un tarif change le panier ; masquer une tranche la retire", async () => {
    const p = await createTestProduct({ stock: 10 });
    const t = await cartWith(p.slug, 1);
    await setCartShippingMethod(testDb, t, "HOME");

    const rate = await testDb.shippingRate.findUniqueOrThrow({
      where: { method_maxWeightGrams: { method: "HOME", maxWeightGrams: 500 } },
    });
    await testDb.$transaction((tx) =>
      saveShippingRate(tx, { ...base, id: rate.id, maxWeightGrams: 500, priceCents: 690 }, ACTOR),
    );
    expect((await getCartView(testDb, t)).totals.shippingCents).toBe(690);

    // Masquée : le colis de 250 g passe à la tranche suivante, ≤ 2 kg.
    await testDb.$transaction((tx) =>
      saveShippingRate(tx, { ...base, id: rate.id, maxWeightGrams: 500, priceCents: 690, active: false }, ACTOR),
    );
    expect((await getCartView(testDb, t)).totals.shippingCents).toBe(990);

    await testDb.shippingRate.update({ where: { id: rate.id }, data: { priceCents: 590, active: true } });
  });

  it("refuse deux tranches identiques pour un même mode", async () => {
    const error = await refusalOf(
      testDb.$transaction((tx) => saveShippingRate(tx, { ...base, maxWeightGrams: 500 }, ACTOR)),
    );
    expect(error.code).toBe("VALIDATION");
    expect(error.fields?.maxWeightGrams).toBeDefined();
  });

  it("le formulaire convertit euros et grammes, virgule comprise", () => {
    const parsed = shippingRateFormSchema.parse({
      carrier: "mondial_relay",
      method: "PICKUP_POINT",
      maxWeight: "1000",
      price: "4,99",
      freeAbove: "49",
      active: true,
    });
    expect(parsed).toMatchObject({ maxWeightGrams: 1000, priceCents: 499, freeAboveCents: 4900 });

    expect(
      shippingRateFormSchema.parse({ carrier: "colissimo", method: "HOME", maxWeight: "500", price: "0", freeAbove: "" }),
    )
      .toMatchObject({ priceCents: 0, freeAboveCents: null });

    expect(
      shippingRateFormSchema.safeParse({ carrier: "colissimo", method: "HOME", maxWeight: "0,5", price: "5" })
        .success,
    ).toBe(false);
  });
});
