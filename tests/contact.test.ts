import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { contactSchema, CONTACT_MAX_LINKS, countLinks } from "@/lib/validation/contact";
import { messageSearchSchema } from "@/lib/validation/admin-message";
import {
  CONTACT_REPLY_DELAY,
  contactInbox,
  listMessages,
  notifyContactMessage,
  setMessageStatus,
  storeContactMessage,
} from "@/server/services/messages";
import { outboxForTests, type EmailMessage } from "@/server/email";
import { RATE_LIMITS } from "@/server/ratelimit";
import { testDb } from "./helpers/db";

/** Formulaire de contact (HEP-89). */

const DOMAIN = "contact-test.example.com";
const ACTOR = "admin-test-contact";

const valid = {
  firstName: "Camille",
  lastName: "Durand",
  email: `camille@${DOMAIN}`,
  subject: "Question sur le sérum",
  body: "Bonjour, le sérum convient-il à une peau sensible ?",
  website: "",
};

async function cleanup() {
  await testDb.message.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
  await testDb.auditLog.deleteMany({ where: { actorId: ACTOR } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await testDb.$disconnect();
});

function store(overrides: Partial<typeof valid> = {}) {
  const input = contactSchema.parse({ ...valid, ...overrides });
  return storeContactMessage(testDb, input, { ipHash: "hash-test" });
}

describe("validation", () => {
  it("accepte un message ordinaire", () => {
    expect(contactSchema.safeParse(valid).success).toBe(true);
  });

  it(`refuse plus de ${CONTACT_MAX_LINKS} liens, avec un message en français`, () => {
    const body = "Voir https://a.fr http://b.fr www.c.fr https://d.fr merci";
    expect(countLinks(body)).toBe(4);
    const result = contactSchema.safeParse({ ...valid, body });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Votre message contient trop de liens (3 au maximum).");
    expect(contactSchema.safeParse({ ...valid, body: "Ma commande : https://hephaistos.fr/suivi/abc" }).success).toBe(true);
  });

  it("refuse un message trop long", () => {
    expect(contactSchema.safeParse({ ...valid, body: "a".repeat(5001) }).success).toBe(false);
  });

  it("aplatit les retours à la ligne du sujet et du nom (injection d'en-tête)", () => {
    const parsed = contactSchema.parse({
      ...valid,
      subject: "Bonjour\r\nBcc: victime@example.com",
      lastName: "Durand\nX",
    });
    expect(parsed.subject).toBe("Bonjour Bcc: victime@example.com");
    expect(parsed.lastName).toBe("Durand X");
  });

  it("transmet le piège à robots à l'action, qui répond BOT_DETECTED", () => {
    // Volontairement pas une erreur de validation : elle s'afficherait sous
    // un champ invisible (cf. `honeypotSchema`).
    expect(contactSchema.parse({ ...valid, website: "http://spam.example" }).website).toBe("http://spam.example");
  });

  it("un envoi en rafale est borné à 3 messages par 10 minutes et par IP", () => {
    // Le quota lui-même est testé dans ratelimit.test.ts ; ici, la règle.
    expect(RATE_LIMITS.contact).toEqual({ limit: 3, windowSeconds: 600, by: "ip" });
  });
});

describe("stockage et notification", () => {
  it("le message est en base, la marque est notifiée et « Répondre » écrit au client", async () => {
    const before = outboxForTests().length;
    const message = await store();

    const row = await testDb.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(row).toMatchObject({ status: "NEW", ipHash: "hash-test", email: valid.email });

    const result = await notifyContactMessage(message);
    expect(result).toEqual({ notified: true, acknowledged: true });

    const sent = outboxForTests().slice(before);
    const notification = sent.find((m) => m.to === contactInbox());
    expect(notification?.replyTo).toBe(valid.email);
    expect(notification?.subject).toBe(`Contact — ${valid.subject}`);
    expect(notification?.text).toContain(valid.body);

    const ack = sent.find((m) => m.to === valid.email);
    expect(ack?.text).toContain(CONTACT_REPLY_DELAY);
    expect(ack?.replyTo).toBe(contactInbox());
  });

  it("le HTML des mails est échappé", async () => {
    const message = await store({ subject: "<script>alert(1)</script>", body: "Texte <b>gras</b> et assez long" });
    const sent: EmailMessage[] = [];
    await notifyContactMessage(message, async (m) => {
      sent.push(m);
    });
    for (const mail of sent) {
      expect(mail.html).not.toContain("<script>");
      expect(mail.html).toContain("&lt;script&gt;");
    }
  });

  it("un échec d'envoi ne perd pas le message et n'empêche pas l'autre mail", async () => {
    const message = await store();
    const delivered: string[] = [];
    const result = await notifyContactMessage(message, async (m) => {
      if (m.to === contactInbox()) throw new Error("Resend indisponible");
      delivered.push(m.to);
    });

    expect(result).toEqual({ notified: false, acknowledged: true });
    expect(delivered).toEqual([valid.email]);
    expect(await testDb.message.count({ where: { id: message.id } })).toBe(1);
  });
});

describe("boîte de réception", () => {
  it("filtre par état, cherche dans le texte, et écarte le spam par défaut", async () => {
    const a = await store({ subject: "Livraison en retard" });
    const b = await store({ subject: "Partenariat", body: "Nous sommes une boutique à Lyon, intéressés." });
    const spam = await store({ subject: "Gagnez de l'argent" });
    await testDb.$transaction((tx) => setMessageStatus(tx, spam.id, "SPAM", ACTOR));

    const all = await listMessages(testDb, { q: DOMAIN });
    expect(all.items.map((m) => m.id).sort()).toEqual([a.id, b.id].sort());

    const bySearch = await listMessages(testDb, { q: "lyon" });
    expect(bySearch.items.map((m) => m.id)).toEqual([b.id]);

    const spamOnly = await listMessages(testDb, { status: "SPAM", q: DOMAIN });
    expect(spamOnly.items.map((m) => m.id)).toEqual([spam.id]);
  });

  it("un changement d'état entre au journal ; répéter le même état n'écrit rien", async () => {
    const m = await store();
    await testDb.$transaction((tx) => setMessageStatus(tx, m.id, "READ", ACTOR));
    await testDb.$transaction((tx) => setMessageStatus(tx, m.id, "READ", ACTOR));
    await testDb.$transaction((tx) => setMessageStatus(tx, m.id, "ANSWERED", ACTOR));

    const logs = await testDb.auditLog.findMany({
      where: { entity: "Message", entityId: m.id },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.map((l) => l.diff)).toEqual([
      { from: "NEW", to: "READ" },
      { from: "READ", to: "ANSWERED" },
    ]);
  });

  it("un message inconnu répond NOT_FOUND", async () => {
    await expect(
      testDb.$transaction((tx) =>
        setMessageStatus(tx, "00000000-0000-4000-8000-000000000000", "READ", ACTOR),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("une URL bricolée est ignorée, pas transformée en erreur", () => {
    expect(messageSearchSchema.parse({ etat: "nimporte", page: "-3", id: "pas-un-uuid", q: "ok" })).toEqual({
      etat: undefined,
      page: undefined,
      id: undefined,
      q: "ok",
    });
  });
});
