import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { createOrder, findOrderByPublicToken } from "@/server/services/orders";
import { addItem } from "@/server/services/cart";
import type { Address } from "@/lib/validation/address";
import { cleanupTestProducts, createTestProduct, testDb } from "./helpers/db";

/**
 * HEP-52 — le modèle de commande.
 *
 * Ce que ces tests protègent tient en une phrase : **une commande est un
 * instantané**. Tout ce qui peut bouger dans le catalogue a été recopié au
 * moment de l'achat, et rien de ce qui bouge ensuite ne doit la réécrire.
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

function token() {
  return `test-${randomBytes(12).toString("base64url")}`;
}

/** Panier de test garni, prêt à devenir une commande. */
async function cartWith(product: { slug: string }, qty = 2) {
  const t = token();
  await addItem(testDb, t, product.slug, qty);
  return t;
}

function place(cartToken: string, overrides: Record<string, unknown> = {}) {
  // Toujours dans une transaction : le numéro est tiré en base, et un échec
  // doit le rendre plutôt que le consommer.
  return testDb.$transaction((tx) =>
    createOrder(tx, {
      cartToken,
      email: "jules@example.com",
      shippingAddress: ADDRESS,
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
  await cleanupTestProducts();
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await testDb.$disconnect();
});

describe("lignes figées", () => {
  it("modifier le prix d'un produit ne change aucune commande existante", async () => {
    // Première definition of done. C'est la règle du parent : « changer un
    // prix demain ne doit pas modifier les anciennes commandes ».
    const p = await createTestProduct({ stock: 10 }); // 2000 centimes
    const order = await place(await cartWith(p));

    expect(order.totals.totalCents).toBe(4000);

    await testDb.product.update({
      where: { id: p.id },
      data: { priceCents: 9900, name: "Nouveau nom", sku: "NOUVEAU-SKU" },
    });

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { totalCents: true, subtotalCents: true, items: true },
    });

    expect(stored.totalCents).toBe(4000);
    expect(stored.subtotalCents).toBe(4000);
    expect(stored.items[0].priceCentsSnapshot).toBe(2000);
    expect(stored.items[0].nameSnapshot).toBe(p.name);
    expect(stored.items[0].skuSnapshot).toBe(p.sku);
  });

  it("archiver un produit laisse la commande lisible et complète", async () => {
    // Deuxième definition of done. `productId` tombe à null, tout le reste
    // survit — c'est exactement ce que les snapshots servent à garantir.
    const p = await createTestProduct({ stock: 10 });
    const order = await place(await cartWith(p, 1));

    await testDb.cartItem.deleteMany({ where: { productId: p.id } });
    await testDb.product.delete({ where: { id: p.id } });

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { number: true, totalCents: true, items: true },
    });

    expect(stored.items).toHaveLength(1);
    expect(stored.items[0].productId).toBeNull();
    expect(stored.items[0].nameSnapshot).toBe(p.name);
    expect(stored.items[0].priceCentsSnapshot).toBe(2000);
    expect(stored.totalCents).toBe(2000);
  });
});

describe("numérotation", () => {
  it("suit le format HF-AAAA-NNNN", async () => {
    const p = await createTestProduct({ stock: 10 });
    const order = await place(await cartWith(p, 1));

    expect(order.number).toMatch(
      new RegExp(`^HF-${new Date().getFullYear()}-\\d{4}$`),
    );
  });

  it("donne des numéros distincts et consécutifs à 25 commandes simultanées", async () => {
    // Troisième definition of done. Deux commandes créées la même seconde
    // doivent avoir deux numéros. Un `SELECT MAX(number) + 1` en JavaScript
    // passerait ce test à 2 commandes et échouerait à 25 — la raison pour
    // laquelle le compteur vit dans Postgres.
    const p = await createTestProduct({ stock: 200 });
    const carts = await Promise.all(
      Array.from({ length: 25 }, () => cartWith(p, 1)),
    );

    const orders = await Promise.all(carts.map((c) => place(c)));
    const numbers = orders.map((o) => o.number).sort();

    expect(new Set(numbers).size).toBe(25);

    const suffixes = numbers.map((n) => Number(n.split("-")[2])).sort((a, b) => a - b);
    expect(suffixes[24] - suffixes[0]).toBe(24); // aucun trou
  });
});

describe("jeton de suivi", () => {
  it("est aléatoire, long, et différent du numéro", async () => {
    const p = await createTestProduct({ stock: 10 });
    const a = await place(await cartWith(p, 1));
    const b = await place(await cartWith(p, 1));

    // 32 octets en base64url : 43 caractères, sans « + », « / » ni « = » qui
    // survivraient mal à une URL.
    expect(a.publicToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.publicToken).not.toBe(b.publicToken);
    expect(a.publicToken).not.toContain(a.number);
  });

  it("ouvre la commande, là où le numéro ne l'ouvre pas", async () => {
    // L'erreur classique : /commande/HF-2026-0042 consultable sans compte, et
    // n'importe qui parcourt toutes les commandes de la boutique — avec les
    // adresses. Il n'existe volontairement aucune recherche par numéro.
    const p = await createTestProduct({ stock: 10 });
    const order = await place(await cartWith(p, 1));

    const found = await findOrderByPublicToken(testDb, order.publicToken);
    expect(found?.number).toBe(order.number);

    expect(await findOrderByPublicToken(testDb, order.number)).toBeNull();
    expect(await findOrderByPublicToken(testDb, "")).toBeNull();
  });
});

describe("adresses", () => {
  it("copie l'adresse dans la commande plutôt que de la référencer", async () => {
    // Le client corrige son adresse après expédition : la commande livrée doit
    // garder celle qui figurait sur le colis, sinon le litige est insoluble.
    const p = await createTestProduct({ stock: 10 });
    const order = await place(await cartWith(p, 1));

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { shippingAddress: true, billingAddress: true },
    });

    expect(stored.shippingAddress).toMatchObject({
      line1: "12 rue de la Forge",
      city: "Paris",
      country: "FR",
    });
    // Facturation absente = livraison, cas de très loin le plus fréquent.
    expect(stored.billingAddress).toEqual(stored.shippingAddress);
  });

  it("garde deux adresses distinctes quand la facturation diffère", async () => {
    const p = await createTestProduct({ stock: 10 });
    const billing: Address = { ...ADDRESS, line1: "9 avenue du Comptable", city: "Lyon" };
    const order = await place(await cartWith(p, 1), { billingAddress: billing });

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { shippingAddress: true, billingAddress: true },
    });

    expect(stored.billingAddress).toMatchObject({ city: "Lyon" });
    expect(stored.shippingAddress).toMatchObject({ city: "Paris" });
  });
});

describe("montants", () => {
  it("enregistre les totaux du moteur de prix, TVA comprise", async () => {
    const p = await createTestProduct({ stock: 10 });
    const order = await place(await cartWith(p, 3), {
      shipping: { priceCents: 590 },
    });

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: {
        subtotalCents: true,
        shippingCents: true,
        taxCents: true,
        totalCents: true,
        vatRate: true,
        currency: true,
        country: true,
      },
    });

    expect(stored.subtotalCents).toBe(6000);
    expect(stored.shippingCents).toBe(590);
    expect(stored.totalCents).toBe(6590);
    // TVA extraite du TTC (HEP-47), pas ajoutée : 6590 − 6590/1,2.
    expect(stored.taxCents).toBe(1098);
    expect(stored.vatRate).toBe(2000);
    expect(stored.currency).toBe("EUR");
    expect(stored.country).toBe("FR");
  });

  it("naît PENDING, sans toucher au stock", async () => {
    // Le stock est décrémenté à l'encaissement (HEP-59), pas à la création :
    // une commande jamais payée ne doit retirer aucun flacon.
    const p = await createTestProduct({ stock: 10 });
    const order = await place(await cartWith(p, 2));

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, paidAt: true },
    });
    const product = await testDb.product.findUniqueOrThrow({ where: { id: p.id } });

    expect(stored.status).toBe("PENDING");
    expect(stored.paidAt).toBeNull();
    expect(product.stock).toBe(10);
  });

  it("refuse un panier vide", async () => {
    await expect(place(token())).rejects.toThrow(/panier est vide/i);
  });
});

describe("précommande", () => {
  it("annonce la date la plus lointaine du panier", async () => {
    // Un seul colis tant que HEP-51 n'a pas tranché : il part quand tout est
    // prêt, donc c'est la dernière date qui est annoncée au client.
    const tot = new Date("2026-10-01T00:00:00Z");
    const tard = new Date("2026-12-01T00:00:00Z");

    const a = await createTestProduct({ stock: 0, availability: "PREORDER" });
    const b = await createTestProduct({ stock: 0, availability: "PREORDER" });
    await testDb.product.update({ where: { id: a.id }, data: { preorderShipsAt: tot } });
    await testDb.product.update({ where: { id: b.id }, data: { preorderShipsAt: tard } });

    const t = token();
    await addItem(testDb, t, a.slug, 1);
    await addItem(testDb, t, b.slug, 1);
    const order = await place(t);

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { isPreorder: true, preorderShipsAt: true },
    });

    expect(stored.isPreorder).toBe(true);
    expect(stored.preorderShipsAt?.toISOString()).toBe(tard.toISOString());
  });

  it("reste une commande ordinaire quand rien n'est en précommande", async () => {
    const p = await createTestProduct({ stock: 10 });
    const order = await place(await cartWith(p, 1));

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { isPreorder: true, preorderShipsAt: true },
    });

    expect(stored.isPreorder).toBe(false);
    expect(stored.preorderShipsAt).toBeNull();
  });
});

describe("clé d'idempotence", () => {
  it("interdit deux commandes pour la même clé", async () => {
    // Le socle de HEP-54 : c'est la contrainte d'unicité qui empêche le double
    // clic sur « payer » de créer deux commandes, pas un test côté client.
    const p = await createTestProduct({ stock: 10 });
    const key = `idem-${randomBytes(8).toString("hex")}`;

    await place(await cartWith(p, 1), { idempotencyKey: key });
    await expect(
      place(await cartWith(p, 1), { idempotencyKey: key }),
    ).rejects.toThrow();
  });
});
