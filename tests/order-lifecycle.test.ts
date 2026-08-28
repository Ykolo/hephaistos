import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import type { OrderStatus } from "@/generated/prisma/client";
import {
  canTransition,
  createOrder,
  findOrderByPublicToken,
  listOrderEvents,
  ORDER_TRANSITIONS,
  setInternalNote,
  transitionOrder,
  TRANSITION_EMAIL,
} from "@/server/services/orders";
import { addItem } from "@/server/services/cart";
import type { Address } from "@/lib/validation/address";
import { cleanupTestProducts, createTestProduct, testDb } from "./helpers/db";

/**
 * HEP-53 — le cycle de vie.
 *
 * Une commande expédiée ne redevient jamais « en préparation ». Ces tests
 * vérifient que la table de transitions est bien la seule autorité, que le
 * journal reconstitue toute la vie de la commande, et qu'un changement d'état
 * demande exactement un mail — jamais zéro par oubli, jamais deux par
 * duplication.
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

async function placeOrder(options: { preorder?: boolean } = {}) {
  const p = await createTestProduct({
    stock: options.preorder ? 0 : 10,
    availability: options.preorder ? "PREORDER" : "IN_STOCK",
  });
  if (options.preorder) {
    await testDb.product.update({
      where: { id: p.id },
      data: { preorderShipsAt: new Date("2026-12-01T00:00:00Z") },
    });
  }

  const cartToken = `test-${randomBytes(12).toString("base64url")}`;
  await addItem(testDb, cartToken, p.slug, 1);

  return testDb.$transaction((tx) =>
    createOrder(tx, {
      cartToken,
      email: "jules@example.com",
      shippingAddress: ADDRESS,
    }),
  );
}

function move(orderId: string, to: OrderStatus, note?: string) {
  return testDb.$transaction((tx) =>
    transitionOrder(tx, { orderId, to, actor: ADMIN, note }),
  );
}

async function statusOf(orderId: string) {
  const o = await testDb.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true },
  });
  return o.status;
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

describe("table de transitions", () => {
  it("décrit exactement les états du parent", () => {
    expect(ORDER_TRANSITIONS.PENDING).toEqual(["PAID", "CANCELED"]);
    expect(ORDER_TRANSITIONS.SHIPPED).toContain("DELIVERED");
    // Terminaux : plus rien ne sort d'une commande annulée ou remboursée.
    expect(ORDER_TRANSITIONS.CANCELED).toEqual([]);
    expect(ORDER_TRANSITIONS.REFUNDED).toEqual([]);
  });

  it("interdit tout retour en arrière", () => {
    // Le cœur de la règle : on n'annule pas une expédition en la niant.
    expect(canTransition("SHIPPED", "PREPARING")).toBe(false);
    expect(canTransition("PAID", "PENDING")).toBe(false);
    expect(canTransition("DELIVERED", "SHIPPED")).toBe(false);
    expect(canTransition("SHIPPED", "CANCELED")).toBe(false);
  });

  it("n'oublie aucun état de l'énumération", () => {
    // Une garde contre l'ajout d'un état sans transition ni mail associés :
    // il serait accepté par le typage et silencieusement inatteignable.
    const declared = Object.keys(ORDER_TRANSITIONS).sort();
    expect(Object.keys(TRANSITION_EMAIL).sort()).toEqual(declared);
  });
});

describe("transition refusée", () => {
  it("laisse la commande intacte et explique pourquoi", async () => {
    // Première definition of done.
    const order = await placeOrder();

    await expect(move(order.id, "SHIPPED")).rejects.toThrow(
      /en attente de paiement.*expédiée/i,
    );

    expect(await statusOf(order.id)).toBe("PENDING");
    // Aucun événement parasite : la tentative refusée n'entre pas au journal,
    // sinon le journal raconterait des choses qui ne sont pas arrivées.
    expect(await listOrderEvents(testDb, order.id)).toHaveLength(1);
  });

  it("refuse de sortir d'un état terminal", async () => {
    const order = await placeOrder();
    await move(order.id, "CANCELED");

    await expect(move(order.id, "PAID")).rejects.toThrow(/annulée/i);
    expect(await statusOf(order.id)).toBe("CANCELED");
  });

  it("garde un journal cohérent quand plusieurs transitions se croisent", async () => {
    // Plusieurs administrateurs sur la même commande. Certaines de ces
    // transitions peuvent légitimement s'enchaîner — PAID → PREPARING →
    // CANCELED est un chemin valide — donc on ne compte pas les échecs.
    //
    // Ce qui doit tenir, c'est la **chaîne** : chaque événement part de l'état
    // où le précédent est arrivé. Sans écriture conditionnée à l'état lu, deux
    // transitions parties de PAID en même temps journaliseraient toutes deux
    // « depuis PAID », et l'une des deux décisions serait écrasée sans trace.
    const order = await placeOrder();
    await move(order.id, "PAID");

    await Promise.allSettled([
      move(order.id, "PREPARING"),
      move(order.id, "CANCELED"),
      move(order.id, "SHIPPED"),
      move(order.id, "REFUNDED"),
    ]);

    const journal = await listOrderEvents(testDb, order.id);
    for (let i = 1; i < journal.length; i++) {
      expect(journal[i].from).toBe(journal[i - 1].to);
    }
    expect(await statusOf(order.id)).toBe(journal[journal.length - 1].to);
  });
});

describe("journal", () => {
  it("permet de reconstituer toute la vie de la commande", async () => {
    // Deuxième definition of done.
    const order = await placeOrder();
    await move(order.id, "PAID", "Paiement Stripe pi_test");
    await move(order.id, "PREPARING");
    await move(order.id, "SHIPPED", "Colissimo 6A12345678901");
    await move(order.id, "DELIVERED");

    const journal = await listOrderEvents(testDb, order.id);

    expect(journal.map((e) => e.to)).toEqual([
      "PENDING",
      "PAID",
      "PREPARING",
      "SHIPPED",
      "DELIVERED",
    ]);
    // La naissance figure au journal, elle n'est pas déduite de son absence.
    expect(journal[0].from).toBeNull();
    expect(journal[1].from).toBe("PENDING");
    expect(journal[3].note).toBe("Colissimo 6A12345678901");
    expect(journal[1].actorId).toBe("admin-test-jules");
  });

  it("horodate le paiement et l'expédition sur la commande", async () => {
    const order = await placeOrder();
    await move(order.id, "PAID");
    await move(order.id, "PREPARING");
    await move(order.id, "SHIPPED");

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { paidAt: true, shippedAt: true },
    });

    expect(stored.paidAt).toBeInstanceOf(Date);
    expect(stored.shippedAt).toBeInstanceOf(Date);
    expect(stored.shippedAt!.getTime()).toBeGreaterThanOrEqual(
      stored.paidAt!.getTime(),
    );
  });
});

describe("mails", () => {
  it("demande exactement un mail par changement, jamais deux", async () => {
    // Troisième definition of done. Le rejeu — le webhook Stripe renvoie son
    // événement — ne doit pas produire un second « commande confirmée ».
    const order = await placeOrder();

    const first = await move(order.id, "PAID");
    expect(first.changed).toBe(true);
    expect(first.email).toBe("commande-confirmee");

    const replay = await move(order.id, "PAID");
    expect(replay.changed).toBe(false);
    expect(replay.email).toBeNull();

    // Et le rejeu n'a pas non plus doublé le journal.
    const journal = await listOrderEvents(testDb, order.id);
    expect(journal.filter((e) => e.to === "PAID")).toHaveLength(1);
  });

  it("n'envoie rien sur un état purement interne", async () => {
    // `null` est une décision : prévenir le client que sa commande est « en
    // préparation » n'apporte rien et use la boîte mail.
    const order = await placeOrder();
    await move(order.id, "PAID");

    expect((await move(order.id, "PREPARING")).email).toBeNull();
  });

  it("choisit le gabarit précommande quand la commande en est une", async () => {
    const order = await placeOrder({ preorder: true });

    expect((await move(order.id, "PAID")).email).toBe("precommande-enregistree");
    await move(order.id, "PREPARING");
    expect((await move(order.id, "SHIPPED")).email).toBe("precommande-expediee");
  });
});

describe("note interne", () => {
  it("s'écrit sur la commande sans jamais sortir de l'administration", async () => {
    const order = await placeOrder();

    await testDb.$transaction((tx) =>
      setInternalNote(tx, order.id, "  Client rappelé, accepte un envoi le 12.  ", ADMIN),
    );

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { internalNote: true },
    });
    expect(stored.internalNote).toBe("Client rappelé, accepte un envoi le 12.");

    // Le suivi public ne la sélectionne pas : c'est le carnet de Jules.
    const publicView = await findOrderByPublicToken(testDb, order.publicToken);
    expect(publicView).not.toHaveProperty("internalNote");
  });

  it("efface la note plutôt que de stocker une chaîne vide", async () => {
    const order = await placeOrder();
    await testDb.$transaction((tx) => setInternalNote(tx, order.id, "à rappeler", ADMIN));
    await testDb.$transaction((tx) => setInternalNote(tx, order.id, "   ", ADMIN));

    const stored = await testDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { internalNote: true },
    });
    expect(stored.internalNote).toBeNull();
  });
});
