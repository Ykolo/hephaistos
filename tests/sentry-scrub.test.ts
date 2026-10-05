import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubEvent, scrubString } from "@/lib/sentry-scrub";

/** Aucune donnée personnelle ne part chez Sentry (HEP-38, definition of done). */
describe("nettoyage des événements Sentry", () => {
  it("masque emails, téléphones et tokens dans le texte", () => {
    const out = scrubString(
      "Échec pour jules@hephaistosparis.com (06 12 34 56 78), panier 3q2-JtmK8f_xYz0aBcDeFgHiJkLmNoPqRsTuVwXyZ01",
    );
    expect(out).not.toContain("jules@");
    expect(out).not.toContain("06 12");
    expect(out).not.toContain("3q2-JtmK8f");
    expect(out).toContain("Échec pour");
  });

  it("vide l'utilisateur, les cookies, le corps et la requête", () => {
    const event = scrubEvent({
      type: undefined,
      user: { id: "u_1", email: "a@b.fr", ip_address: "203.0.113.4" },
      request: {
        url: "https://hephaistosparis.com/newsletter/confirmer?token=abc",
        query_string: "token=abc",
        cookies: { hep_cart: "secret" },
        data: { email: "a@b.fr" },
        headers: { cookie: "hep_cart=secret", "user-agent": "Mozilla" },
      },
    } as ErrorEvent);

    expect(event.user).toEqual({ id: "u_1" });
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.data).toBeUndefined();
    expect(event.request?.url).toBe("https://hephaistosparis.com/newsletter/confirmer");
    expect(event.request?.query_string).toBe("[filtré]");
    expect(event.request?.headers?.cookie).toBe("[filtré]");
    expect(event.request?.headers?.["user-agent"]).toBe("Mozilla");
  });

  it("masque les clés sensibles des contextes, mais pas la trace", () => {
    const traceId = "0123456789abcdef0123456789abcdef";
    const event = scrubEvent({
      type: undefined,
      extra: { order: { email: "a@b.fr", shippingAddress: "1 rue X", total: 4200 } },
      contexts: { trace: { trace_id: traceId, span_id: "0123456789abcdef" } },
    } as ErrorEvent);

    expect(event.extra).toEqual({
      order: { email: "[filtré]", shippingAddress: "[filtré]", total: 4200 },
    });
    expect(event.contexts?.trace?.trace_id).toBe(traceId);
  });

  it("nettoie les messages d'exception", () => {
    const event = scrubEvent({
      type: undefined,
      exception: { values: [{ type: "Error", value: "Unique constraint: a@b.fr" }] },
    } as ErrorEvent);
    expect(event.exception?.values?.[0]?.value).toBe("Unique constraint: [filtré]");
  });
});
