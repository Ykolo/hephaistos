import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  adminNextStatuses,
  countQuickFilters,
  getAdminOrder,
  ORDER_PAGE_SIZE,
  parisDay,
  parisMidnight,
  searchOrders,
  stripePaymentUrl,
} from "@/server/services/admin-orders";
import { createOrder, transitionOrder } from "@/server/services/orders";
import { addItem } from "@/server/services/cart";
import { orderSearchSchema } from "@/lib/validation/admin-order";
import type { Address } from "@/lib/validation/address";
import { cleanupTestProducts, createTestProduct, testDb } from "./helpers/db";

/**
 * HEP-56 — l'écran que Jules ouvre tous les matins.
 *
 * Chaque test cherche dans un domaine d'email propre à ce fichier : d'autres
 * suites laissent des commandes dans la base partagée, et une recherche non
 * cloisonnée compterait aussi les leurs.
 */

const DOMAIN = `hep56-${randomBytes(4).toString("hex")}.example.com`;
const ADMIN = { kind: "admin", id: "admin-test-jules" } as const;

/** Maintenant figé : le 2 octobre 2026 à 10 h, heure de Paris (UTC+2). */
const NOW = new Date("2026-10-02T08:00:00Z");

function address(firstName: string, lastName: string): Address {
  return {
    firstName,
    lastName,
    line1: "12 rue de la Forge",
    postalCode: "75011",
    city: "Paris",
    country: "FR",
    phone: "+33612345678",
  };
}

let product: Awaited<ReturnType<typeof createTestProduct>>;

async function order(opts: {
  email: string;
  name: [string, string];
  createdAt: string;
  status?: "PAID" | "PREPARING" | "SHIPPED";
  preorderShipsAt?: string | null;
}) {
  const cartToken = `test-${randomBytes(12).toString("base64url")}`;
  await addItem(testDb, cartToken, product.slug, 1);
  const created = await testDb.$transaction((tx) =>
    createOrder(tx, {
      cartToken,
      email: `${opts.email}@${DOMAIN}`,
      shippingAddress: address(...opts.name),
    }),
  );

  if (opts.status) {
    const path = { PAID: ["PAID"], PREPARING: ["PAID", "PREPARING"], SHIPPED: ["PAID", "PREPARING", "SHIPPED"] } as const;
    await testDb.$transaction(async (tx) => {
      for (const to of path[opts.status!]) {
        await transitionOrder(tx, { orderId: created.id, to, actor: ADMIN });
      }
    });
  }

  // Mise en scène : date de création et précommande posées directement.
  await testDb.order.update({
    where: { id: created.id },
    data: {
      createdAt: new Date(opts.createdAt),
      ...(opts.preorderShipsAt !== undefined
        ? {
            isPreorder: true,
            preorderShipsAt: opts.preorderShipsAt ? new Date(opts.preorderShipsAt) : null,
          }
        : {}),
    },
  });

  return testDb.order.findUniqueOrThrow({ where: { id: created.id } });
}

/** Recherche cloisonnée au domaine de ce fichier. */
function search(params: Record<string, string> = {}) {
  const parsed = orderSearchSchema.parse({ ...params, q: `${DOMAIN} ${params.q ?? ""}` });
  return searchOrders(testDb, parsed, NOW);
}

const numbers = (r: Awaited<ReturnType<typeof search>>) => r.rows.map((o) => o.number);

let o: Record<string, Awaited<ReturnType<typeof order>>>;

beforeAll(async () => {
  product = await createTestProduct({ stock: 100 });
  o = {
    // Payée hier : dans la pile.
    paidYesterday: await order({
      email: "jules.forgeron",
      name: ["Jules", "Forgeron"],
      createdAt: "2026-10-01T09:00:00Z",
      status: "PAID",
    }),
    // En préparation, la plus ancienne : en tête de pile.
    preparing: await order({
      email: "ana",
      name: ["Ana", "Martin"],
      createdAt: "2026-09-28T09:00:00Z",
      status: "PREPARING",
    }),
    // Jamais payée.
    pending: await order({
      email: "paul",
      name: ["Paul", "Forgeron"],
      createdAt: "2026-10-02T07:00:00Z",
    }),
    // Partie : hors pile.
    shipped: await order({
      email: "lea",
      name: ["Léa", "Durand"],
      createdAt: "2026-09-20T09:00:00Z",
      status: "SHIPPED",
    }),
    // Précommande pour novembre : payée, mais pas encore à expédier.
    preorderLater: await order({
      email: "marc",
      name: ["Marc", "Petit"],
      createdAt: "2026-09-25T09:00:00Z",
      status: "PAID",
      preorderShipsAt: "2026-11-15T00:00:00Z",
    }),
    // Précommande dont la date est atteinte aujourd'hui : à expédier.
    preorderDue: await order({
      email: "zoe",
      name: ["Zoé", "Bernard"],
      createdAt: "2026-09-10T09:00:00Z",
      status: "PAID",
      preorderShipsAt: "2026-10-02T00:00:00Z",
    }),
    // Passée à 0 h 30 à Paris le 2 octobre — encore le 1er en UTC.
    justAfterParisMidnight: await order({
      email: "nuit",
      name: ["Hugo", "Lune"],
      createdAt: "2026-10-01T22:30:00Z",
    }),
  };
});

afterAll(async () => {
  await testDb.order.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
  await testDb.cartItem.deleteMany({ where: { cart: { token: { startsWith: "test-" } } } });
  await testDb.cart.deleteMany({ where: { token: { startsWith: "test-" } } });
  await cleanupTestProducts();
});

describe("heure de Paris", () => {
  it("minuit à Paris en été est 22 h UTC la veille", () => {
    expect(parisMidnight("2026-10-02").toISOString()).toBe("2026-10-01T22:00:00.000Z");
  });

  it("minuit à Paris en hiver est 23 h UTC la veille", () => {
    expect(parisMidnight("2026-12-15").toISOString()).toBe("2026-12-14T23:00:00.000Z");
  });

  it("tient les jours de changement d'heure", () => {
    // Passage à l'heure d'été le 29 mars 2026 à 2 h : minuit est encore en UTC+1.
    expect(parisMidnight("2026-03-29").toISOString()).toBe("2026-03-28T23:00:00.000Z");
    // Retour à l'heure d'hiver le 25 octobre 2026 à 3 h : minuit est encore en UTC+2.
    expect(parisMidnight("2026-10-25").toISOString()).toBe("2026-10-24T22:00:00.000Z");
  });

  it("le jour calendaire suit Paris, pas UTC", () => {
    expect(parisDay(new Date("2026-10-01T22:30:00Z"))).toBe("2026-10-02");
  });
});

describe("recherche", () => {
  it("retrouve une commande par un bout d'email, sans tenir compte de la casse", async () => {
    expect(numbers(await search({ q: "JULES.FORG" }))).toEqual([o.paidYesterday.number]);
  });

  it("retrouve une commande par son numéro", async () => {
    expect(numbers(await search({ q: o.preparing.number.toLowerCase() }))).toEqual([
      o.preparing.number,
    ]);
  });

  it("retrouve par le nom porté sur l'adresse", async () => {
    const r = await search({ q: "forgeron" });
    expect(numbers(r).sort()).toEqual([o.paidYesterday.number, o.pending.number].sort());
  });

  it("prénom + nom : chaque mot doit correspondre", async () => {
    expect(numbers(await search({ q: "paul forgeron" }))).toEqual([o.pending.number]);
  });

  it("filtre par état", async () => {
    expect(numbers(await search({ status: "SHIPPED" }))).toEqual([o.shipped.number]);
  });

  it("une plage de dates se lit en jours de Paris, bornes incluses", async () => {
    const r = await search({ from: "2026-10-02", to: "2026-10-02" });
    expect(numbers(r).sort()).toEqual(
      [o.pending.number, o.justAfterParisMidnight.number].sort(),
    );
  });

  it("trie les plus récentes d'abord par défaut", async () => {
    const r = await search();
    const dates = r.rows.map((row) => row.createdAt.getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    expect(r.total).toBe(Object.keys(o).length);
  });

  it("porte le nom du client dans chaque ligne", async () => {
    const r = await search({ q: "jules.forgeron" });
    expect(r.rows[0].customerName).toBe("Jules Forgeron");
  });

  it("un paramètre d'URL invalide est ignoré, pas fatal", () => {
    expect(orderSearchSchema.parse({ status: "NIMPORTE", page: "-3", from: "hier" })).toEqual({
      status: undefined,
      page: undefined,
      from: undefined,
      q: undefined,
      quick: undefined,
      to: undefined,
      sort: undefined,
    });
  });
});

describe("filtres rapides", () => {
  it("« à expédier » est exactement la pile du jour, la plus ancienne en tête", async () => {
    const r = await search({ quick: "a-expedier" });
    expect(numbers(r)).toEqual([
      o.preorderDue.number, // 10 sept., date d'envoi atteinte
      o.preparing.number, // 28 sept.
      o.paidYesterday.number, // 1er oct.
    ]);
  });

  it("« à expédier » laisse de côté la précommande pas encore due", async () => {
    expect(numbers(await search({ quick: "a-expedier" }))).not.toContain(o.preorderLater.number);
  });

  it("« en attente de paiement »", async () => {
    expect(numbers(await search({ quick: "attente-paiement" })).sort()).toEqual(
      [o.pending.number, o.justAfterParisMidnight.number].sort(),
    );
  });

  it("« précommandes » : encaissées et pas encore parties", async () => {
    expect(numbers(await search({ quick: "precommandes" })).sort()).toEqual(
      [o.preorderLater.number, o.preorderDue.number].sort(),
    );
  });

  it("« du jour » compte depuis minuit à Paris", async () => {
    expect(numbers(await search({ quick: "du-jour" })).sort()).toEqual(
      [o.pending.number, o.justAfterParisMidnight.number].sort(),
    );
  });

  it("les compteurs incluent au moins les commandes de ce fichier", async () => {
    const counts = await countQuickFilters(testDb, NOW);
    expect(counts["a-expedier"]).toBeGreaterThanOrEqual(3);
    expect(counts.precommandes).toBeGreaterThanOrEqual(2);
  });
});

describe("pagination", () => {
  it("une page au-delà de la dernière ramène à la dernière", async () => {
    const r = await search({ page: "99" });
    expect(r.page).toBe(1);
    expect(r.pageCount).toBe(1);
    expect(r.rows.length).toBeLessThanOrEqual(ORDER_PAGE_SIZE);
  });
});

describe("fiche détail", () => {
  it("charge lignes, adresses et journal à partir du numéro", async () => {
    const detail = await getAdminOrder(testDb, o.preparing.number);
    expect(detail?.items).toHaveLength(1);
    expect(detail?.items[0].skuSnapshot).toBe(product.sku);
    // La création écrit elle-même le premier événement du journal.
    expect(detail?.events.map((e) => e.to)).toEqual(["PENDING", "PAID", "PREPARING"]);
    expect(detail?.shippingAddress).toMatchObject({ lastName: "Martin" });
  });

  it("un numéro inconnu ne trouve rien", async () => {
    expect(await getAdminOrder(testDb, "HF-1999-0000")).toBeNull();
    expect(await getAdminOrder(testDb, "")).toBeNull();
  });
});

describe("transitions proposées à la main", () => {
  it("ne propose jamais « payée » : seul Stripe encaisse", () => {
    expect(adminNextStatuses("PENDING")).toEqual([]);
  });

  it("suit la table de transitions", () => {
    expect(adminNextStatuses("PAID")).toEqual(["PREPARING"]);
    expect(adminNextStatuses("PREPARING")).toEqual(["SHIPPED"]);
    expect(adminNextStatuses("SHIPPED")).toEqual(["DELIVERED"]);
    expect(adminNextStatuses("DELIVERED")).toEqual([]);
    expect(adminNextStatuses("CANCELED")).toEqual([]);
  });
});

describe("lien Stripe", () => {
  it("mode test par défaut, réel seulement avec une clé live", () => {
    expect(stripePaymentUrl("pi_123", undefined)).toBe("https://dashboard.stripe.com/test/payments/pi_123");
    expect(stripePaymentUrl("pi_123", "sk_test_abc")).toBe("https://dashboard.stripe.com/test/payments/pi_123");
    expect(stripePaymentUrl("pi_123", "sk_live_abc")).toBe("https://dashboard.stripe.com/payments/pi_123");
  });
});
