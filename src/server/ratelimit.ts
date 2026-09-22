import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiting (HEP-35).
 *
 * Une fenêtre glissante par usage, jamais une limite globale : le quota de la
 * newsletter n'a aucune raison d'être partagé avec celui du panier.
 *
 * Ce module est **pur** — il ne lit ni en-tête ni cookie. L'identifiant (IP
 * hachée, token de panier) est calculé par `action.ts`, ce qui garde la
 * logique testable sans requête HTTP.
 */

export type RateLimitRule = {
  /** Nombre d'exécutions autorisées par `windowSeconds`. */
  limit: number;
  windowSeconds: number;
  /** Clé d'isolement : IP (hachée) ou session (token de panier). */
  by: "ip" | "session";
};

/**
 * Les quotas de l'application, en un seul endroit pour être relus d'un coup
 * d'œil. Chaque action publique y pioche au lieu d'inventer ses chiffres.
 */
export const RATE_LIMITS = {
  newsletter: { limit: 5, windowSeconds: 10 * 60, by: "ip" },
  contact: { limit: 3, windowSeconds: 10 * 60, by: "ip" },
  review: { limit: 2, windowSeconds: 24 * 60 * 60, by: "ip" },
  // Connexion (lot 6) : à doubler d'une seconde règle par compte, sinon une
  // attaque distribuée sur un seul compte passe sous le radar de l'IP.
  login: { limit: 5, windowSeconds: 15 * 60, by: "ip" },
  checkout: { limit: 10, windowSeconds: 10 * 60, by: "ip" },
  cart: { limit: 60, windowSeconds: 60, by: "session" },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitVerdict = { allowed: boolean; remaining: number };

type Limiter = (key: string) => Promise<RateLimitVerdict>;

// --- Upstash ----------------------------------------------------------------

function upstashRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

function upstashLimiter(redis: Redis, rule: RateLimitRule): Limiter {
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(rule.limit, `${rule.windowSeconds} s`),
    prefix: "hep:rl",
    // Au-delà d'une seconde sans réponse, on laisse passer : un Redis lent ne
    // doit pas transformer chaque envoi de formulaire en attente de 5 s.
    timeout: 1000,
    analytics: false,
  });
  return async (key) => {
    const { success, remaining } = await ratelimit.limit(key);
    return { allowed: success, remaining };
  };
}

// --- Repli en mémoire -------------------------------------------------------

/**
 * Fenêtre glissante en mémoire, utilisée quand Upstash n'est pas configuré :
 * en local, dans les tests, et — en dernier recours — en production.
 *
 * En production, elle ne protège **qu'une instance** de fonction : un robot
 * réparti sur plusieurs instances passe. C'est une protection partielle, pas
 * une solution ; d'où l'erreur journalisée tant qu'Upstash manque.
 */
function memoryLimiter(rule: RateLimitRule): Limiter {
  const hits = new Map<string, number[]>();
  return async (key) => {
    const now = Date.now();
    const since = now - rule.windowSeconds * 1000;
    const recent = (hits.get(key) ?? []).filter((t) => t > since);
    const allowed = recent.length < rule.limit;
    if (allowed) recent.push(now);
    hits.set(key, recent);
    return { allowed, remaining: Math.max(0, rule.limit - recent.length) };
  };
}

// --- Point d'entrée ---------------------------------------------------------

const limiters = new Map<string, Limiter>();
let warnedMissingUpstash = false;

function limiterFor(name: string, rule: RateLimitRule): Limiter {
  const id = `${name}:${rule.limit}/${rule.windowSeconds}`;
  let limiter = limiters.get(id);
  if (limiter) return limiter;

  const redis = upstashRedis();
  if (redis) {
    limiter = upstashLimiter(redis, rule);
  } else {
    if (process.env.NODE_ENV === "production" && !warnedMissingUpstash) {
      warnedMissingUpstash = true;
      console.error(
        "[ratelimit] UPSTASH_REDIS_REST_URL absent : repli en mémoire, " +
          "protection limitée à une instance.",
      );
    }
    limiter = memoryLimiter(rule);
  }
  limiters.set(id, limiter);
  return limiter;
}

/**
 * Consomme une unité du quota `name` pour `identifier`.
 *
 * Échoue **ouvert** : si Redis est injoignable, la requête passe. Refuser
 * toute inscription parce qu'un service tiers tousse serait pire que l'abus
 * qu'on cherche à empêcher. L'échec est journalisé.
 */
export async function consumeRateLimit(
  name: string,
  rule: RateLimitRule,
  identifier: string,
): Promise<RateLimitVerdict> {
  try {
    return await limiterFor(name, rule)(`${name}:${identifier}`);
  } catch (error) {
    console.error(`[ratelimit:${name}]`, error);
    return { allowed: true, remaining: rule.limit };
  }
}

/** Réservé aux tests : repart de quotas vierges. */
export function resetRateLimitsForTests() {
  limiters.clear();
}
