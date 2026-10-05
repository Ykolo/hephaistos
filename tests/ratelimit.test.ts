import { beforeEach, describe, expect, it } from "vitest";
import { hashIp } from "@/server/ip";
import {
  consumeRateLimit,
  RATE_LIMITS,
  resetRateLimitsForTests,
} from "@/server/ratelimit";

/**
 * Rate limiting (HEP-35), sur le repli en mémoire : la CI n'a pas d'Upstash,
 * et c'est la même fenêtre glissante qui s'applique.
 */
describe("rate limiting", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetRateLimitsForTests();
  });

  it("refuse la 6e inscription newsletter d'affilée depuis la même IP", async () => {
    const verdicts = [];
    for (let i = 0; i < 6; i++) {
      verdicts.push(await consumeRateLimit("newsletter", RATE_LIMITS.newsletter, "ip:a"));
    }
    expect(verdicts.map((v) => v.allowed)).toEqual([true, true, true, true, true, false]);
  });

  it("isole les quotas par identifiant", async () => {
    for (let i = 0; i < 3; i++) {
      await consumeRateLimit("contact", RATE_LIMITS.contact, "ip:a");
    }
    expect((await consumeRateLimit("contact", RATE_LIMITS.contact, "ip:a")).allowed).toBe(false);
    expect((await consumeRateLimit("contact", RATE_LIMITS.contact, "ip:b")).allowed).toBe(true);
  });

  it("isole les quotas par usage", async () => {
    for (let i = 0; i < 3; i++) {
      await consumeRateLimit("contact", RATE_LIMITS.contact, "ip:a");
    }
    expect((await consumeRateLimit("newsletter", RATE_LIMITS.newsletter, "ip:a")).allowed).toBe(
      true,
    );
  });
});

describe("hachage des IP", () => {
  it("ne laisse jamais apparaître l'IP en clair", () => {
    const hash = hashIp("203.0.113.42");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203.0.113.42");
  });

  it("dépend du sel", () => {
    const before = process.env.IP_HASH_SALT;
    process.env.IP_HASH_SALT = "sel-a";
    const a = hashIp("203.0.113.42");
    process.env.IP_HASH_SALT = "sel-b";
    const b = hashIp("203.0.113.42");
    process.env.IP_HASH_SALT = before;
    expect(a).not.toBe(b);
  });
});
