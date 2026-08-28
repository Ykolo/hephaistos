import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  addItem,
  clearCart,
  getCartView,
  getOrCreateCart,
  MAX_QTY_PER_LINE,
  removeItem,
  updateQty,
} from "@/server/services/cart";
import { cleanupTestProducts, createTestProduct, testDb } from "./helpers/db";

/** Un token par test : les paniers ne doivent jamais se croiser. */
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

describe("panier — cycle de vie", () => {
  it("crée le panier au premier ajout et le retrouve ensuite", async () => {
    const t = token();
    const p = await createTestProduct({ stock: 10 });

    await addItem(testDb, t, p.slug, 2);
    const view = await getCartView(testDb, t);

    expect(view.itemCount).toBe(2);
    expect(view.lines[0].slug).toBe(p.slug);
  });

  it("survit à une nouvelle session avec le même token", async () => {
    // C'est la première definition of done : le client ferme le navigateur,
    // revient, et retrouve son panier. Le token est la seule continuité.
    const t = token();
    const p = await createTestProduct({ stock: 10 });
    await addItem(testDb, t, p.slug, 3);

    const later = await getCartView(testDb, t);
    expect(later.itemCount).toBe(3);
  });

  it("deux tokens différents ne partagent rien", async () => {
    const a = token();
    const b = token();
    const p = await createTestProduct({ stock: 10 });

    await addItem(testDb, a, p.slug, 2);
    expect((await getCartView(testDb, b)).itemCount).toBe(0);
  });

  it("un token inconnu renvoie un panier vide, pas une erreur", async () => {
    const view = await getCartView(testDb, token());
    expect(view).toMatchObject({ itemCount: 0, subtotalCents: 0, lines: [] });
  });

  it("prolonge l'expiration à chaque interaction", async () => {
    const t = token();
    const p = await createTestProduct({ stock: 10 });

    await addItem(testDb, t, p.slug, 1);
    const first = await testDb.cart.findUniqueOrThrow({ where: { token: t } });

    await new Promise((r) => setTimeout(r, 20));
    await addItem(testDb, t, p.slug, 1);
    const second = await testDb.cart.findUniqueOrThrow({ where: { token: t } });

    expect(second.expiresAt.getTime()).toBeGreaterThan(first.expiresAt.getTime());
  });
});

describe("panier — aucun montant n'est stocké", () => {
  it("ne conserve que produit et quantité", async () => {
    // La ligne en base ne doit contenir aucun prix : c'est ce qui rend
    // impossible toute falsification côté client.
    const t = token();
    const p = await createTestProduct({ stock: 10 });
    await addItem(testDb, t, p.slug, 2);

    const item = await testDb.cartItem.findFirstOrThrow({
      where: { cart: { token: t } },
    });
    expect(Object.keys(item)).toEqual(
      expect.arrayContaining(["productId", "qty"]),
    );
    expect(Object.keys(item)).not.toContain("priceCents");
    expect(Object.keys(item)).not.toContain("unitPrice");
  });

  it("reflète un changement de prix survenu après l'ajout", async () => {
    // Le panier ne fige rien : le figeage n'intervient qu'à la commande.
    const t = token();
    const p = await createTestProduct({ stock: 10 });
    await addItem(testDb, t, p.slug, 2);

    expect((await getCartView(testDb, t)).subtotalCents).toBe(4000);

    await testDb.product.update({
      where: { id: p.id },
      data: { priceCents: 2500 },
    });

    expect((await getCartView(testDb, t)).subtotalCents).toBe(5000);
  });
});

describe("panier — ce qu'on refuse d'ajouter", () => {
  it("refuse un brouillon", async () => {
    const t = token();
    const p = await createTestProduct({ stock: 10 });
    await testDb.product.update({
      where: { id: p.id },
      data: { status: "DRAFT" },
    });

    await expect(addItem(testDb, t, p.slug, 1)).rejects.toMatchObject({
      code: "PRODUCT_UNAVAILABLE",
    });
  });

  it("refuse un produit archivé", async () => {
    const t = token();
    const p = await createTestProduct({ stock: 10 });
    await testDb.product.update({
      where: { id: p.id },
      data: { status: "ARCHIVED" },
    });

    await expect(addItem(testDb, t, p.slug, 1)).rejects.toMatchObject({
      code: "PRODUCT_UNAVAILABLE",
    });
  });

  it("refuse un produit pas encore commercialisé", async () => {
    const t = token();
    const p = await createTestProduct({ stock: 10, availability: "COMING_SOON" });

    await expect(addItem(testDb, t, p.slug, 1)).rejects.toMatchObject({
      code: "PRODUCT_UNAVAILABLE",
    });
  });

  it("refuse au-delà du stock disponible", async () => {
    const t = token();
    const p = await createTestProduct({ stock: 3 });

    await expect(addItem(testDb, t, p.slug, 5)).rejects.toMatchObject({
      code: "OUT_OF_STOCK",
    });
  });

  it("accepte une précommande sans stock", async () => {
    const t = token();
    const p = await createTestProduct({ stock: 0, availability: "PREORDER" });

    await addItem(testDb, t, p.slug, 2);
    const view = await getCartView(testDb, t);
    expect(view.itemCount).toBe(2);
    expect(view.lines[0].isPreorder).toBe(true);
  });

  it("refuse un produit inexistant", async () => {
    await expect(
      addItem(testDb, token(), "test-nexiste-pas", 1),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("panier — plafond de quantité", () => {
  it("refuse au-delà du maximum par ligne", async () => {
    const t = token();
    const p = await createTestProduct({ stock: 100 });

    await expect(
      addItem(testDb, t, p.slug, MAX_QTY_PER_LINE + 1),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("le plafond porte sur le total de la ligne, pas sur l'ajout", async () => {
    // Sinon dix ajouts de 1 contourneraient un plafond de 10.
    const t = token();
    const p = await createTestProduct({ stock: 100 });

    await addItem(testDb, t, p.slug, MAX_QTY_PER_LINE);
    await expect(addItem(testDb, t, p.slug, 1)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("refuse une quantité nulle ou négative", async () => {
    const t = token();
    const p = await createTestProduct({ stock: 10 });

    await expect(addItem(testDb, t, p.slug, 0)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(addItem(testDb, t, p.slug, -3)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("panier — opérations", () => {
  it("cumule au lieu de créer une seconde ligne", async () => {
    const t = token();
    const p = await createTestProduct({ stock: 10 });

    await addItem(testDb, t, p.slug, 1);
    await addItem(testDb, t, p.slug, 2);

    const view = await getCartView(testDb, t);
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0].qty).toBe(3);
  });

  it("fixe une quantité", async () => {
    const t = token();
    const p = await createTestProduct({ stock: 10 });
    await addItem(testDb, t, p.slug, 5);

    await updateQty(testDb, t, p.slug, 2);
    expect((await getCartView(testDb, t)).itemCount).toBe(2);
  });

  it("une quantité de zéro retire la ligne", async () => {
    const t = token();
    const p = await createTestProduct({ stock: 10 });
    await addItem(testDb, t, p.slug, 3);

    await updateQty(testDb, t, p.slug, 0);
    expect((await getCartView(testDb, t)).lines).toHaveLength(0);
  });

  it("retire une ligne", async () => {
    const t = token();
    const a = await createTestProduct({ stock: 10 });
    const b = await createTestProduct({ stock: 10 });
    await addItem(testDb, t, a.slug, 1);
    await addItem(testDb, t, b.slug, 1);

    await removeItem(testDb, t, a.slug);
    const view = await getCartView(testDb, t);
    expect(view.lines.map((l) => l.slug)).toEqual([b.slug]);
  });

  it("vide le panier", async () => {
    const t = token();
    const p = await createTestProduct({ stock: 10 });
    await addItem(testDb, t, p.slug, 4);

    await clearCart(testDb, t);
    expect((await getCartView(testDb, t)).itemCount).toBe(0);
  });

  it("retirer un article absent ne lève pas d'erreur", async () => {
    const t = token();
    const p = await createTestProduct({ stock: 10 });
    await expect(removeItem(testDb, t, p.slug)).resolves.toBeUndefined();
  });
});

describe("panier — lignes devenues invalides", () => {
  it("signale une ligne dont le stock est passé sous la quantité", async () => {
    // Le stock peut fondre entre l'ajout et le paiement : le panier doit le
    // dire plutôt que de laisser découvrir la rupture au moment de payer.
    const t = token();
    const p = await createTestProduct({ stock: 5 });
    await addItem(testDb, t, p.slug, 4);

    await testDb.product.update({ where: { id: p.id }, data: { stock: 2 } });

    const view = await getCartView(testDb, t);
    expect(view.hasUnavailableLines).toBe(true);
    expect(view.lines[0].availableUnits).toBe(2);
  });

  it("ne signale rien quand tout est disponible", async () => {
    const t = token();
    const p = await createTestProduct({ stock: 10 });
    await addItem(testDb, t, p.slug, 2);

    expect((await getCartView(testDb, t)).hasUnavailableLines).toBe(false);
  });
});

describe("panier — coffret", () => {
  it("un coffret dont un composant manque est refusé", async () => {
    const t = token();
    const [a, b] = await Promise.all([
      createTestProduct({ stock: 5 }),
      createTestProduct({ stock: 0 }),
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

    await expect(addItem(testDb, t, bundle.slug, 1)).rejects.toMatchObject({
      code: "OUT_OF_STOCK",
    });
  });
});

describe("panier — token", () => {
  it("réutilise le panier existant plutôt que d'en créer un second", async () => {
    const t = token();
    const first = await getOrCreateCart(testDb, t);
    const second = await getOrCreateCart(testDb, t);
    expect(second.id).toBe(first.id);
  });
});
