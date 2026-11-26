import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import {
  CONSENT_VERSION,
  encodeConsent,
  parseConsent,
  TRACKERS,
} from "@/lib/consent";
import {
  choiceFor,
  consentProofForOrder,
  consentSnapshot,
  recordConsent,
} from "@/server/services/consent";
import { createOrder } from "@/server/services/orders";
import { addItem } from "@/server/services/cart";
import type { Address } from "@/lib/validation/address";
import {
  chooseTestShipping,
  cleanupTestProducts,
  createTestProduct,
  testDb,
  withTestShippingGrid,
} from "./helpers/db";

/** Consentement aux cookies (HEP-93). */

withTestShippingGrid();

const UA = "vitest-consent";
const ADDRESS: Address = {
  firstName: "Jules",
  lastName: "Martin",
  line1: "12 rue de la Paix",
  postalCode: "75002",
  city: "Paris",
  country: "FR",
  phone: "+33612345678",
};

async function cleanup() {
  await testDb.order.deleteMany({ where: { email: "consent@example.com" } });
  await testDb.cart.deleteMany({ where: { token: { startsWith: "test-" } } });
  await testDb.consentRecord.deleteMany({ where: { userAgent: UA } });
  await cleanupTestProducts();
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await testDb.$disconnect();
});

function record(action: Parameters<typeof recordConsent>[1]["action"], previousCookie: string | null = null, custom = { analytics: false, marketing: false }) {
  return recordConsent(testDb, { previousCookie, action, choice: custom, ipHash: "hash", userAgent: UA });
}

describe("cookie hf_consent", () => {
  it("aller-retour, et rien d'accepté sur une valeur forgée ou d'une autre version", () => {
    const state = { consentId: randomUUID(), version: CONSENT_VERSION, analytics: true, marketing: false };
    expect(parseConsent(encodeConsent(state))).toEqual(state);
    expect(parseConsent("1.pas-un-uuid.11")).toBeNull();
    expect(parseConsent(`${CONSENT_VERSION + 1}.${state.consentId}.11`)).toBeNull();
    expect(parseConsent(undefined)).toBeNull();
  });

  it("fermer la bannière vaut refus, quoi qu'envoie le navigateur", () => {
    expect(choiceFor("dismiss", { analytics: true, marketing: true })).toEqual({ analytics: false, marketing: false });
    expect(choiceFor("reject_all", { analytics: true, marketing: true })).toEqual({ analytics: false, marketing: false });
    expect(choiceFor("accept_all", { analytics: false, marketing: false })).toEqual({ analytics: true, marketing: true });
    expect(choiceFor("custom", { analytics: true, marketing: false })).toEqual({ analytics: true, marketing: false });
  });

  it("la politique de cookies liste chaque traceur avec sa durée", () => {
    expect(TRACKERS.map((t) => t.name)).toContain("hf_consent");
    for (const t of TRACKERS) expect(t.duration).not.toBe("");
  });
});

describe("preuve", () => {
  it("chaque clic ajoute une preuve ; un même navigateur garde son identifiant", async () => {
    const first = await record("accept_all");
    const second = await record("reject_all", encodeConsent(first));
    expect(second.consentId).toBe(first.consentId);

    const proofs = await testDb.consentRecord.findMany({
      where: { consentId: first.consentId },
      orderBy: { createdAt: "asc" },
    });
    expect(proofs.map((p) => [p.action, p.analytics, p.marketing, p.version, p.ipHash])).toEqual([
      ["accept_all", true, true, CONSENT_VERSION, "hash"],
      ["reject_all", false, false, CONSENT_VERSION, "hash"],
    ]);
  });

  it("le checkout se fie à la dernière preuve en base, pas au cookie", async () => {
    const accepted = await record("accept_all");
    await record("reject_all", encodeConsent(accepted));

    // Le navigateur a gardé l'ancien cookie, ou l'a réécrit à la main.
    const forged = encodeConsent({ ...accepted, analytics: true, marketing: true });
    const snap = await consentSnapshot(testDb, forged);
    expect(snap).toMatchObject({ analytics: false, marketing: false });
    expect(snap.recordId).not.toBeNull();
  });

  it("un cookie sans preuve en base ne vaut aucun consentement", async () => {
    const invented = encodeConsent({ consentId: randomUUID(), version: CONSENT_VERSION, analytics: true, marketing: true });
    expect(await consentSnapshot(testDb, invented)).toEqual({ analytics: false, marketing: false, at: null, recordId: null });
    expect(await consentSnapshot(testDb, null)).toMatchObject({ analytics: false, recordId: null });
  });

  it("la preuve est retrouvable depuis la commande", async () => {
    const consent = await record("custom", null, { analytics: true, marketing: false });
    const snapshot = await consentSnapshot(testDb, encodeConsent(consent));

    const p = await createTestProduct({ stock: 5 });
    const token = `test-${randomBytes(12).toString("base64url")}`;
    await addItem(testDb, token, p.slug, 1);
    await chooseTestShipping(token);
    const order = await testDb.$transaction((tx) =>
      createOrder(tx, { cartToken: token, email: "consent@example.com", shippingAddress: ADDRESS, consent: snapshot }),
    );

    const saved = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved).toMatchObject({ consentAnalytics: true, consentMarketing: false, consentRecordId: consent.recordId });
    expect(saved.consentAt).toEqual(snapshot.at);

    const proof = await consentProofForOrder(testDb, order.id);
    expect(proof).toMatchObject({ id: consent.recordId, action: "custom", analytics: true, marketing: false });
  });

  it("une commande sans consentement fourni n'autorise aucune mesure", async () => {
    const p = await createTestProduct({ stock: 5 });
    const token = `test-${randomBytes(12).toString("base64url")}`;
    await addItem(testDb, token, p.slug, 1);
    await chooseTestShipping(token);
    const order = await testDb.$transaction((tx) =>
      createOrder(tx, { cartToken: token, email: "consent@example.com", shippingAddress: ADDRESS }),
    );
    const saved = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved).toMatchObject({ consentAnalytics: false, consentMarketing: false, consentRecordId: null, consentAt: null });
  });
});
