import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  CONFIRM_TTL_DAYS,
  confirmationEmail,
  confirmSubscription,
  PENDING_RETENTION_DAYS,
  purgeStalePending,
  RESEND_COOLDOWN_MINUTES,
  subscribe,
  unsubscribe,
} from "@/server/services/newsletter";
import { newsletterSchema } from "@/lib/validation/contact";
import { testDb } from "./helpers/db";

/** Newsletter en double opt-in (HEP-67). */

const DOMAIN = "newsletter-test.example.com";
const DAY = 24 * 60 * 60 * 1000;

async function cleanup() {
  await testDb.subscriber.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
}
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await testDb.$disconnect();
});

function sub(email: string, now = new Date(), source: "band" | "hero" | "produit" = "band") {
  return subscribe(testDb, { email, source, ipHash: "hash", userAgent: "vitest" }, now);
}

function row(email: string) {
  return testDb.subscriber.findUniqueOrThrow({ where: { email } });
}

describe("inscription", () => {
  it("arrive en base en PENDING, avec la preuve du consentement et son origine", async () => {
    const email = `a@${DOMAIN}`;
    const now = new Date("2026-11-26T10:00:00Z");
    const outcome = await sub(email, now, "produit");
    expect(outcome.send).toBe(true);

    const r = await row(email);
    expect(r).toMatchObject({ status: "PENDING", source: "produit", ipHash: "hash", consentAt: now, confirmedAt: null });
    expect(r.tokenExpiresAt).toEqual(new Date(now.getTime() + CONFIRM_TTL_DAYS * DAY));
  });

  it("une adresse déjà confirmée ne reçoit rien, et rien ne la distingue côté visiteur", async () => {
    const email = `b@${DOMAIN}`;
    const first = await sub(email);
    if (!first.send) throw new Error("attendu");
    await confirmSubscription(testDb, first.confirmToken);
    expect(await sub(email)).toEqual({ send: false });
    expect((await row(email)).status).toBe("CONFIRMED");
  });

  it(`ne renvoie pas le lien plus d'une fois par ${RESEND_COOLDOWN_MINUTES} minutes`, async () => {
    const email = `c@${DOMAIN}`;
    const t0 = new Date("2026-11-26T10:00:00Z");
    await sub(email, t0);
    expect(await sub(email, new Date(t0.getTime() + 60_000))).toEqual({ send: false });
    const later = await sub(email, new Date(t0.getTime() + (RESEND_COOLDOWN_MINUTES + 1) * 60_000));
    expect(later.send).toBe(true);
  });

  it("un renvoi invalide l'ancien lien", async () => {
    const email = `d@${DOMAIN}`;
    const t0 = new Date("2026-11-26T10:00:00Z");
    const first = await sub(email, t0);
    const second = await sub(email, new Date(t0.getTime() + 11 * 60_000));
    if (!first.send || !second.send) throw new Error("attendu");
    expect(await confirmSubscription(testDb, first.confirmToken, t0)).toBe("invalid");
    expect(await confirmSubscription(testDb, second.confirmToken, t0)).toBe("confirmed");
  });

  it("le schéma normalise l'adresse et refuse une source inconnue", () => {
    expect(newsletterSchema.parse({ email: " Jules@Example.COM ", source: "band" }).email).toBe("jules@example.com");
    expect(newsletterSchema.safeParse({ email: "x@example.com", source: "popup" }).success).toBe(false);
  });
});

describe("confirmation", () => {
  it("confirme, horodate, et un second clic répond « déjà »", async () => {
    const email = `e@${DOMAIN}`;
    const t0 = new Date("2026-11-26T10:00:00Z");
    const outcome = await sub(email, t0);
    if (!outcome.send) throw new Error("attendu");
    const at = new Date(t0.getTime() + 3600_000);
    expect(await confirmSubscription(testDb, outcome.confirmToken, at)).toBe("confirmed");
    expect(await row(email)).toMatchObject({ status: "CONFIRMED", confirmedAt: at });
    expect(await confirmSubscription(testDb, outcome.confirmToken, at)).toBe("already");
  });

  it(`refuse un lien de plus de ${CONFIRM_TTL_DAYS} jours, et un jeton inventé`, async () => {
    const email = `f@${DOMAIN}`;
    const t0 = new Date("2026-11-01T10:00:00Z");
    const outcome = await sub(email, t0);
    if (!outcome.send) throw new Error("attendu");
    expect(await confirmSubscription(testDb, outcome.confirmToken, new Date(t0.getTime() + 8 * DAY))).toBe("expired");
    expect((await row(email)).status).toBe("PENDING");
    expect(await confirmSubscription(testDb, "jeton-invente")).toBe("invalid");
    expect(await confirmSubscription(testDb, null)).toBe("invalid");
  });
});

describe("désinscription", () => {
  it("fonctionne sans connexion, une seule fois, et un vieux lien de confirmation ne réinscrit pas", async () => {
    const email = `g@${DOMAIN}`;
    const outcome = await sub(email);
    if (!outcome.send) throw new Error("attendu");
    await confirmSubscription(testDb, outcome.confirmToken);

    expect(await unsubscribe(testDb, outcome.unsubToken)).toBe("unsubscribed");
    expect((await row(email)).status).toBe("UNSUBSCRIBED");
    expect(await unsubscribe(testDb, outcome.unsubToken)).toBe("already");
    expect(await confirmSubscription(testDb, outcome.confirmToken)).toBe("invalid");
    expect(await unsubscribe(testDb, "inconnu")).toBe("invalid");
  });

  it("se réinscrire après une désinscription redemande une confirmation", async () => {
    const email = `h@${DOMAIN}`;
    const first = await sub(email);
    if (!first.send) throw new Error("attendu");
    await unsubscribe(testDb, first.unsubToken);
    const again = await sub(email);
    expect(again.send).toBe(true);
    expect((await row(email)).status).toBe("PENDING");
  });
});

describe("purge et mail", () => {
  it(`efface les inscriptions jamais confirmées après ${PENDING_RETENTION_DAYS} jours, et elles seules`, async () => {
    const old = `old@${DOMAIN}`;
    const kept = `kept@${DOMAIN}`;
    const confirmed = `ok@${DOMAIN}`;
    await sub(old);
    await sub(kept);
    const c = await sub(confirmed);
    if (!c.send) throw new Error("attendu");
    await confirmSubscription(testDb, c.confirmToken);
    const longAgo = new Date(Date.now() - (PENDING_RETENTION_DAYS + 1) * DAY);
    await testDb.subscriber.updateMany({ where: { email: { in: [old, confirmed] } }, data: { createdAt: longAgo } });

    await purgeStalePending(testDb);
    const left = await testDb.subscriber.findMany({ where: { email: { endsWith: `@${DOMAIN}` } }, select: { email: true } });
    expect(left.map((l) => l.email).sort()).toEqual([confirmed, kept].sort());
  });

  it("le mail ne contient l'adresse dans aucun lien, et porte la désinscription en un clic", () => {
    const mail = confirmationEmail({
      to: `jules@${DOMAIN}`,
      confirmUrl: "https://hephaistos.test/api/newsletter/confirm?token=abc",
      unsubUrl: "https://hephaistos.test/desinscription?token=xyz",
      unsubPostUrl: "https://hephaistos.test/api/newsletter/unsubscribe?token=xyz",
    });
    expect(mail.html).toContain("token=abc");
    expect(mail.html).not.toContain(DOMAIN);
    expect(mail.headers).toEqual({
      "List-Unsubscribe": "<https://hephaistos.test/api/newsletter/unsubscribe?token=xyz>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});
