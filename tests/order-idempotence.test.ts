import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  cartIdempotencyKey,
  placeOrder,
  type PlaceOrderResult,
} from "@/server/services/orders";
import { addItem, updateQty } from "@/server/services/cart";
import type { Address } from "@/lib/validation/address";
import { cleanupTestProducts, createTestProduct, testDb } from "./helpers/db";

/**
 * HEP-54 — « l'erreur numéro un des boutiques développées sur mesure ».
 *
 * Le bouton désactivé ne protège de rien : double-tap avant l'hydratation,
 * rechargement pendant la requête, retour arrière puis re-soumission. La
 * garantie doit tenir en base, et c'est ce que ces tests vérifient.
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

async function filledCart(qty = 2) {
  const p = await createTestProduct({ stock: 50 });
  const cartToken = token();
  await addItem(testDb, cartToken, p.slug, qty);
  return { product: p, cartToken };
}

function submit(cartToken: string, idempotencyKey: string) {
  return placeOrder(testDb, {
    cartToken,
    email: "jules@example.com",
    shippingAddress: ADDRESS,
    idempotencyKey,
  });
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

describe("le double clic", () => {
  it("deux soumissions simultanées ne créent qu'une commande", async () => {
    // Première definition of done : deux clics à 50 ms d'intervalle, une
    // commande. Ici c'est pire — les deux partent en même temps.
    const { cartToken } = await filledCart();
    const key = await cartIdempotencyKey(testDb, cartToken);

    const results = await Promise.allSettled([
      submit(cartToken, key),
      submit(cartToken, key),
    ]);

    const ok = results.filter(
      (r): r is PromiseFulfilledResult<PlaceOrderResult> => r.status === "fulfilled",
    );
    expect(ok).toHaveLength(2); // les deux réussissent…

    const ids = new Set(ok.map((r) => r.value.id));
    expect(ids.size).toBe(1); // …sur la même commande

    // Et une seule commande en base : le conflit d'unicité a fait son travail.
    expect(await testDb.order.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it("survit à 25 soumissions en parallèle", async () => {
    // Deux appels ne prouvent rien : ils se sérialisent presque toujours. La
    // même leçon que sur le stock (HEP-84) et la numérotation (HEP-52).
    const { cartToken } = await filledCart(1);
    const key = await cartIdempotencyKey(testDb, cartToken);

    const results = await Promise.all(
      Array.from({ length: 25 }, () => submit(cartToken, key)),
    );

    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(new Set(results.map((r) => r.number)).size).toBe(1);
    expect(await testDb.order.count({ where: { idempotencyKey: key } })).toBe(1);

    // Une seule création, 24 rejeux. C'est ce drapeau qui dira au tunnel de
    // réutiliser la session Stripe au lieu d'en ouvrir une seconde.
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(results.filter((r) => r.replayed)).toHaveLength(24);
  });

  it("ne consomme qu'un seul numéro de commande", async () => {
    // Un rejeu qui tirerait quand même un numéro laisserait un trou par clic
    // dans la série.
    const { cartToken } = await filledCart(1);
    const key = await cartIdempotencyKey(testDb, cartToken);

    const first = await submit(cartToken, key);
    await submit(cartToken, key);
    await submit(cartToken, key);

    const orders = await testDb.order.findMany({
      where: { email: "jules@example.com" },
      select: { number: true },
    });
    expect(orders).toEqual([{ number: first.number }]);
  });
});

describe("rejeu", () => {
  it("renvoie la même commande, à l'identique", async () => {
    // Seconde definition of done.
    const { cartToken } = await filledCart();
    const key = await cartIdempotencyKey(testDb, cartToken);

    const first = await submit(cartToken, key);
    const replay = await submit(cartToken, key);

    expect(replay.id).toBe(first.id);
    expect(replay.number).toBe(first.number);
    expect(replay.publicToken).toBe(first.publicToken);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
  });

  it("refuse une soumission sans clé", async () => {
    const { cartToken } = await filledCart();
    await expect(submit(cartToken, "")).rejects.toThrow(/rechargez votre panier/i);
  });
});

describe("la clé", () => {
  it("est stable tant que le panier ne bouge pas", async () => {
    // C'est ce qui la distingue d'un `randomUUID` en champ caché : deux
    // rendus de la page panier donnent la même clé, donc la même commande.
    const { cartToken } = await filledCart();

    expect(await cartIdempotencyKey(testDb, cartToken)).toBe(
      await cartIdempotencyKey(testDb, cartToken),
    );
  });

  it("change dès qu'une ligne bouge", async () => {
    // « Nouvelle clé après toute modification du panier » : gratuit, puisque
    // le panier est touché à chaque mutation (HEP-46).
    const { product, cartToken } = await filledCart(2);
    const before = await cartIdempotencyKey(testDb, cartToken);

    await updateQty(testDb, cartToken, product.slug, 3);

    expect(await cartIdempotencyKey(testDb, cartToken)).not.toBe(before);
  });

  it("diffère d'un panier à l'autre, même à contenu identique", async () => {
    const p = await createTestProduct({ stock: 50 });
    const a = token();
    const b = token();
    await addItem(testDb, a, p.slug, 1);
    await addItem(testDb, b, p.slug, 1);

    expect(await cartIdempotencyKey(testDb, a)).not.toBe(
      await cartIdempotencyKey(testDb, b),
    );
  });

  it("permet une nouvelle commande une fois le panier modifié", async () => {
    // Le pendant du test précédent : l'idempotence ne doit pas emprisonner un
    // client qui change d'avis et repasse commande.
    const { product, cartToken } = await filledCart(1);

    const first = await submit(cartToken, await cartIdempotencyKey(testDb, cartToken));
    await updateQty(testDb, cartToken, product.slug, 2);
    const second = await submit(cartToken, await cartIdempotencyKey(testDb, cartToken));

    expect(second.id).not.toBe(first.id);
    expect(second.replayed).toBe(false);
  });

  it("ne fuit rien du panier", async () => {
    // Un condensé, pas un identifiant lisible : la clé transite par un champ
    // caché, elle ne doit rien apprendre à qui la lit.
    const { product, cartToken } = await filledCart();
    const key = await cartIdempotencyKey(testDb, cartToken);

    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(key).not.toContain(product.id);
    expect(key).not.toContain(cartToken);
  });

  it("refuse de produire une clé pour un panier inexistant", async () => {
    await expect(cartIdempotencyKey(testDb, token())).rejects.toThrow(/panier/i);
  });
});
