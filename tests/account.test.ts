import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { auth } from "@/server/auth";
import { CART_COOKIE } from "@/server/cart-session";
import { outboxForTests } from "@/server/email";
import { resetRateLimitsForTests } from "@/server/ratelimit";
import { attachGuestOrders } from "@/server/services/account";
import { MAX_QTY_PER_LINE } from "@/server/services/cart";
import { mergeCartsOnSignIn } from "@/server/services/cart-merge";
import { cleanupTestProducts, createTestProduct, testDb } from "./helpers/db";

/**
 * Parcours client (HEP-63) et fusion du panier (HEP-49). Les definitions of
 * done, cas par cas :
 * - panier invité + panier compte avec le même produit → une seule ligne,
 *   aucun produit perdu, quantité = max ;
 * - créer un compte après coup fait apparaître la commande… après
 *   vérification de l'email, jamais avant ;
 * - un lien de réinitialisation ne fonctionne qu'une fois ;
 * - aucune réponse ne dit si une adresse a un compte.
 */

const PASSWORD = "un mot de passe solide";
const EMAIL_DOMAIN = "@hep63.example.test";

const newEmail = () => `client-${crypto.randomUUID().slice(0, 8)}${EMAIL_DOMAIN}`;
const cartToken = () => `test-acc-${randomBytes(12).toString("base64url")}`;

function ip(cookie?: string) {
  const n = () => Math.floor(Math.random() * 250) + 1;
  const h = new Headers({ "x-real-ip": `10.${n()}.${n()}.${n()}` });
  if (cookie) h.set("cookie", cookie);
  return h;
}

function lastMailTo(email: string, subjectStart: string) {
  return [...outboxForTests()].reverse().find((m) => m.to === email && m.subject.startsWith(subjectStart));
}

function linkIn(text: string): URL {
  return new URL(text.match(/https?:\/\/\S+/)![0]);
}

async function createUser(email = newEmail(), emailVerified = true) {
  // L'identifiant est généré par Better Auth, pas par la base.
  return testDb.user.create({ data: { id: crypto.randomUUID(), email, name: "Client de test", emailVerified } });
}

async function cartWith(
  items: { productId: string; qty: number }[],
  opts: { userId?: string; discountCode?: string } = {},
) {
  return testDb.cart.create({
    data: {
      token: cartToken(),
      userId: opts.userId,
      discountCode: opts.discountCode,
      expiresAt: new Date(Date.now() + 86_400_000),
      items: { create: items },
    },
  });
}

async function guestOrder(email: string) {
  const suffix = randomBytes(6).toString("hex");
  return testDb.order.create({
    data: {
      number: `TEST-ACC-${suffix}`,
      publicToken: `test-acc-${suffix}`,
      email,
      subtotalCents: 2000,
      shippingCents: 0,
      taxCents: 333,
      totalCents: 2000,
      shippingAddress: {},
      billingAddress: {},
    },
  });
}

/** Compte inscrit et vérifié par le vrai parcours ; renvoie son cookie de session. */
async function verifiedAccount(email = newEmail()) {
  await auth.api.signUpEmail({ body: { name: "Client", email, password: PASSWORD }, headers: ip() });
  const token = linkIn(lastMailTo(email, "Confirmez")!.text).searchParams.get("token")!;
  await auth.api.verifyEmail({ query: { token } });
  return email;
}

function setCookieValue(response: Response, name: string): string | undefined {
  const header = response.headers.get("set-cookie") ?? "";
  return header.match(new RegExp(`(?:^|,\\s*)${name.replace(".", "\\.")}=([^;]*)`))?.[1];
}

async function cleanup() {
  await testDb.cart.deleteMany({
    where: {
      OR: [{ token: { startsWith: "test-acc-" } }, { user: { email: { endsWith: EMAIL_DOMAIN } } }],
    },
  });
  await testDb.order.deleteMany({ where: { number: { startsWith: "TEST-ACC-" } } });
  await testDb.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await cleanupTestProducts();
}

beforeEach(async () => {
  resetRateLimitsForTests();
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await testDb.$disconnect();
});

describe("fusion du panier à la connexion (HEP-49)", () => {
  it("une seule ligne par produit, quantité = max, aucun produit perdu", async () => {
    const user = await createUser();
    const serum = await createTestProduct({ stock: 20 });
    const cleanser = await createTestProduct({ stock: 20 });
    const guest = await cartWith([{ productId: serum.id, qty: 1 }]);
    const account = await cartWith(
      [
        { productId: serum.id, qty: 2 },
        { productId: cleanser.id, qty: 1 },
      ],
      { userId: user.id },
    );

    const newToken = cartToken();
    const result = await testDb.$transaction((tx) =>
      mergeCartsOnSignIn(tx, { guestToken: guest.token, userId: user.id, newToken }),
    );

    expect(result.token).toBe(newToken);
    const carts = await testDb.cart.findMany({ where: { userId: user.id }, include: { items: true } });
    expect(carts).toHaveLength(1);
    const qty = Object.fromEntries(carts[0].items.map((i) => [i.productId, i.qty]));
    // Le max, pas la somme : 2 sérums, pas 3.
    expect(qty).toEqual({ [serum.id]: 2, [cleanser.id]: 1 });
    expect(await testDb.cart.findUnique({ where: { id: account.id } })).toBeNull();
    // L'ancien jeton (pré-connexion) n'ouvre plus rien.
    expect(await testDb.cart.findUnique({ where: { token: guest.token } })).toBeNull();
  });

  it("plafonne au stock et au maximum par ligne, sans jamais faire disparaître une ligne", async () => {
    const user = await createUser();
    const scarce = await createTestProduct({ stock: 5 });
    const soldOut = await createTestProduct({ stock: 0 });
    const preorder = await createTestProduct({ stock: 0, availability: "PREORDER" });
    const guest = await cartWith([
      { productId: scarce.id, qty: 3 },
      { productId: preorder.id, qty: MAX_QTY_PER_LINE + 5 },
    ]);
    await cartWith(
      [
        { productId: scarce.id, qty: 8 },
        { productId: soldOut.id, qty: 2 },
      ],
      { userId: user.id },
    );

    await testDb.$transaction((tx) =>
      mergeCartsOnSignIn(tx, { guestToken: guest.token, userId: user.id, newToken: cartToken() }),
    );

    const items = await testDb.cartItem.findMany({ where: { cartId: guest.id } });
    const qty = Object.fromEntries(items.map((i) => [i.productId, i.qty]));
    expect(qty[scarce.id]).toBe(5);
    expect(qty[preorder.id]).toBe(MAX_QTY_PER_LINE);
    // Épuisé : gardé à 1, la vue du panier le signale comme indisponible.
    expect(qty[soldOut.id]).toBe(1);
  });

  it("garde le code promo du panier invité et signale celui écarté", async () => {
    const user = await createUser();
    const p = await createTestProduct({ stock: 10 });
    const guest = await cartWith([{ productId: p.id, qty: 1 }], { discountCode: "INVITE" });
    await cartWith([{ productId: p.id, qty: 1 }], { userId: user.id, discountCode: "COMPTE" });

    const result = await testDb.$transaction((tx) =>
      mergeCartsOnSignIn(tx, { guestToken: guest.token, userId: user.id, newToken: cartToken() }),
    );
    expect(result.discountReplaced).toBe(true);
    expect((await testDb.cart.findUniqueOrThrow({ where: { id: guest.id } })).discountCode).toBe("INVITE");
  });

  it("ne s'approprie jamais le panier d'un autre compte", async () => {
    const [me, other] = [await createUser(), await createUser()];
    const p = await createTestProduct({ stock: 10 });
    const theirs = await cartWith([{ productId: p.id, qty: 4 }], { userId: other.id });
    const mine = await cartWith([{ productId: p.id, qty: 1 }], { userId: me.id });

    const newToken = cartToken();
    const result = await testDb.$transaction((tx) =>
      mergeCartsOnSignIn(tx, { guestToken: theirs.token, userId: me.id, newToken }),
    );

    expect(result.token).toBe(newToken);
    expect((await testDb.cart.findUniqueOrThrow({ where: { id: mine.id } })).token).toBe(newToken);
    const untouched = await testDb.cart.findUniqueOrThrow({ where: { id: theirs.id }, include: { items: true } });
    expect(untouched).toMatchObject({ userId: other.id, token: theirs.token });
    expect(untouched.items[0].qty).toBe(4);
  });

  it("sans aucun panier, ne pose rien", async () => {
    const user = await createUser();
    const result = await testDb.$transaction((tx) =>
      mergeCartsOnSignIn(tx, { guestToken: null, userId: user.id, newToken: cartToken() }),
    );
    expect(result.token).toBeNull();
  });

  it("la vraie connexion fusionne et pose un nouveau cookie de panier", async () => {
    const email = await verifiedAccount();
    const p = await createTestProduct({ stock: 10 });
    const guest = await cartWith([{ productId: p.id, qty: 2 }]);

    const response = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      headers: ip(`${CART_COOKIE}=${guest.token}`),
      asResponse: true,
    });
    expect(response.status).toBe(200);

    const rotated = setCookieValue(response, CART_COOKIE);
    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(guest.token);
    const cart = await testDb.cart.findUniqueOrThrow({ where: { token: rotated! } });
    const user = await testDb.user.findUniqueOrThrow({ where: { email } });
    expect(cart).toMatchObject({ id: guest.id, userId: user.id });
  });

  it("la déconnexion oublie le panier sur cet appareil", async () => {
    const email = await verifiedAccount();
    const signIn = await auth.api.signInEmail({ body: { email, password: PASSWORD }, headers: ip(), asResponse: true });
    const session = signIn.headers.get("set-cookie")!.match(/hep\.session_token=[^;]+/)![0];

    const out = await auth.api.signOut({ headers: ip(session), asResponse: true });
    expect(out.headers.get("set-cookie") ?? "").toMatch(new RegExp(`${CART_COOKIE}=;[^,]*Max-Age=0`, "i"));
  });
});

describe("commandes passées sans compte (HEP-63)", () => {
  it("ne rattache rien tant que l'adresse n'est pas vérifiée", async () => {
    const user = await createUser(newEmail(), false);
    await guestOrder(user.email);
    expect(await attachGuestOrders(testDb, user)).toBe(0);
  });

  it("rattache, sans tenir compte de la casse, seulement les commandes sans compte", async () => {
    const user = await createUser();
    const other = await createUser();
    const mine = await guestOrder(user.email.toUpperCase());
    const alreadyOwned = await testDb.order.update({
      where: { id: (await guestOrder(user.email)).id },
      data: { userId: other.id },
    });

    expect(await attachGuestOrders(testDb, user)).toBe(1);
    expect((await testDb.order.findUniqueOrThrow({ where: { id: mine.id } })).userId).toBe(user.id);
    expect((await testDb.order.findUniqueOrThrow({ where: { id: alreadyOwned.id } })).userId).toBe(other.id);
  });

  it("créer un compte après coup fait apparaître la commande — après la vérification", async () => {
    const email = newEmail();
    const order = await guestOrder(email);

    await auth.api.signUpEmail({ body: { name: "Client", email, password: PASSWORD }, headers: ip() });
    // Compte créé, adresse non prouvée : la commande reste orpheline.
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).userId).toBeNull();

    const token = linkIn(lastMailTo(email, "Confirmez")!.text).searchParams.get("token")!;
    await auth.api.verifyEmail({ query: { token } });

    const user = await testDb.user.findUniqueOrThrow({ where: { email } });
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).userId).toBe(user.id);
  });
});

describe("ne jamais révéler qu'une adresse a un compte", () => {
  it("l'inscription répond pareil, et c'est le titulaire qui est prévenu", async () => {
    const existing = await verifiedAccount();
    const fresh = newEmail();

    const a = await auth.api.signUpEmail({
      body: { name: "X", email: existing, password: PASSWORD },
      headers: ip(),
      asResponse: true,
    });
    const b = await auth.api.signUpEmail({
      body: { name: "X", email: fresh, password: PASSWORD },
      headers: ip(),
      asResponse: true,
    });
    expect(a.status).toBe(b.status);
    expect(Object.keys(await a.json()).sort()).toEqual(Object.keys(await b.json()).sort());
    expect(lastMailTo(existing, "Vous avez déjà un compte")).toBeDefined();
  });

  it("« mot de passe oublié » répond pareil pour une adresse inconnue", async () => {
    const existing = await verifiedAccount();
    const known = await auth.api.requestPasswordReset({
      body: { email: existing, redirectTo: "/reinitialiser" },
      headers: ip(),
    });
    const unknown = await auth.api.requestPasswordReset({
      body: { email: newEmail(), redirectTo: "/reinitialiser" },
      headers: ip(),
    });
    expect(unknown).toEqual(known);
  });
});

describe("réinitialisation du mot de passe", () => {
  it("le lien ne fonctionne qu'une fois", async () => {
    const email = await verifiedAccount();
    await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reinitialiser" }, headers: ip() });
    // Lien de l'email : …/reset-password/<jeton>?callbackURL=/reinitialiser
    const token = linkIn(lastMailTo(email, "Réinitialiser")!.text).pathname.split("/").pop()!;

    await auth.api.resetPassword({ body: { token, newPassword: "un tout nouveau mot de passe" } });
    await expect(
      auth.api.resetPassword({ body: { token, newPassword: "encore un autre mot de passe" } }),
    ).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });

    // Et c'est bien le premier qui a été retenu.
    const ok = await auth.api.signInEmail({
      body: { email, password: "un tout nouveau mot de passe" },
      headers: ip(),
      asResponse: true,
    });
    expect(ok.status).toBe(200);
  });
});
