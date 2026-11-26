import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { after } from "next/server";
import {
  CART_COOKIE,
  CART_NOTICE_COOKIE,
  cartCookieOptions,
  cartNoticeCookieOptions,
  newCartToken,
} from "./cart-session";
import { db } from "./db";
import { accountEmail, sendEmail, type EmailMessage } from "./email";
import { ipHashFromHeaders } from "./ip";
import { consumeRateLimit, RATE_LIMITS, type RateLimitRule } from "./ratelimit";
import { attachGuestOrders } from "./services/account";
import { mergeCartsOnSignIn } from "./services/cart-merge";
import { siteOrigin, vercelOrigins } from "./site-url";

/**
 * Authentification (HEP-62) — un seul socle pour les clients et l'admin.
 *
 * Auto-hébergé : comptes, sessions et secrets TOTP vivent dans le Postgres du
 * projet. Aucune donnée client chez un tiers.
 *
 * Ce module ne fait que **configurer**. Les vérifications d'accès sont dans
 * `auth-guards.ts` (`requireUser`, `requireAdmin`) — c'est elles, et elles
 * seules, que le reste du code appelle.
 *
 * Variables : `BETTER_AUTH_SECRET` (signature des cookies, obligatoire en
 * production) et `BETTER_AUTH_URL` (origine publique). Sur une preview, où
 * l'URL change à chaque déploiement, l'origine se déduit de `VERCEL_URL`.
 */

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const ONE_DAY = 60 * 60 * 24;

// Origine publique : même calcul que les autres emails du site
// (`site-url.ts`). Sans aucune origine, Better Auth écrirait des liens
// relatifs, inutilisables hors du site.
const baseURL = siteOrigin();

// --- Emails ----------------------------------------------------------------

/**
 * L'email part **après** la réponse HTTP. Attendre l'envoi rendrait la
 * réponse de « mot de passe oublié » plus lente pour une adresse inscrite que
 * pour une adresse inconnue : le temps de réponse suffirait à savoir qui a un
 * compte. Hors requête Next (tests, scripts), l'envoi part sans attendre.
 */
function deliverInBackground(message: EmailMessage): void {
  // L'échec est déjà remonté en alerte par `sendEmail`.
  const task = () => sendEmail(message).catch(() => undefined);
  try {
    after(task);
  } catch {
    void task();
  }
}

// --- Rate limiting -----------------------------------------------------------

type AuthQuota = { name: string; rule: RateLimitRule };

/**
 * Quotas par point d'entrée. Les routes absentes de cette table passent sans
 * quota applicatif (le rate limit intégré de Better Auth reste actif).
 */
const QUOTAS: Record<string, AuthQuota[]> = {
  "/sign-in/email": [
    { name: "login", rule: RATE_LIMITS.login },
    { name: "login-account", rule: RATE_LIMITS.loginAccount },
  ],
  "/sign-up/email": [{ name: "sign-up", rule: RATE_LIMITS.signUp }],
  "/request-password-reset": [
    { name: "auth-email-ip", rule: RATE_LIMITS.signUp },
    { name: "auth-email", rule: RATE_LIMITS.authEmail },
  ],
  "/send-verification-email": [
    { name: "auth-email-ip", rule: RATE_LIMITS.signUp },
    { name: "auth-email", rule: RATE_LIMITS.authEmail },
  ],
  "/two-factor/verify-totp": [{ name: "two-factor", rule: RATE_LIMITS.twoFactor }],
  "/two-factor/verify-backup-code": [{ name: "two-factor", rule: RATE_LIMITS.twoFactor }],
};

/**
 * Le compte visé, haché : une adresse email n'a rien à faire en clair dans
 * une clé Redis. Minuscules d'abord, sinon `Jules@` et `jules@` auraient
 * chacun leurs cinq essais.
 */
function accountKey(email: unknown): string | null {
  if (typeof email !== "string" || email.length === 0) return null;
  const digest = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  return `acct:${digest}`;
}

const rateLimitHook = createAuthMiddleware(async (ctx) => {
  const quotas = QUOTAS[ctx.path];
  if (!quotas) return;

  const headers = ctx.headers ?? ctx.request?.headers ?? new Headers();
  const ipKey = `ip:${ipHashFromHeaders(headers)}`;
  const account = accountKey((ctx.body as { email?: unknown } | undefined)?.email);

  for (const { name, rule } of quotas) {
    const identifier = rule.by === "account" ? account : ipKey;
    // Pas d'email dans le corps : la validation de Better Auth répondra.
    if (!identifier) continue;
    const verdict = await consumeRateLimit(name, rule, identifier);
    if (!verdict.allowed) {
      throw new APIError("TOO_MANY_REQUESTS", {
        message: "Trop de tentatives. Réessayez dans quelques minutes.",
      });
    }
  }
});

// --- Après connexion ---------------------------------------------------------

/**
 * Tout ce qui suit l'ouverture d'une session, quel que soit le chemin :
 * connexion, connexion automatique après vérification de l'email, second
 * facteur validé. Une seule porte, pour qu'aucun parcours ne l'oublie.
 *
 * - le panier invité rejoint celui du compte (HEP-49), sous un nouveau jeton ;
 * - les commandes passées sans compte avec cette adresse sont rattachées
 *   (HEP-63) — l'adresse a forcément été vérifiée pour qu'une session existe.
 *
 * À la déconnexion, le cookie de panier part aussi : sur un ordinateur
 * partagé, le visiteur suivant n'a pas à retrouver le panier du compte.
 */
const afterSessionHook = createAuthMiddleware(async (ctx) => {
  if (ctx.path === "/sign-out") {
    ctx.setCookie(CART_COOKIE, "", { ...cartCookieOptions, maxAge: 0 });
    return;
  }

  const created = ctx.context.newSession;
  if (!created) return;
  // Mot de passe validé, second facteur encore attendu : la session n'est
  // pas ouverte, rien ne doit encore s'y rattacher.
  const twoFactorPlugin = ctx.context.getPlugin("two-factor") as {
    shouldRequireTwoFactor?: (c: typeof ctx) => Promise<boolean>;
  } | null;
  if (await twoFactorPlugin?.shouldRequireTwoFactor?.(ctx)) return;

  const { user } = created;
  const guestToken = ctx.getCookie(CART_COOKIE) ?? null;
  const merged = await db.$transaction(async (tx) => {
    await attachGuestOrders(tx, user);
    return mergeCartsOnSignIn(tx, { guestToken, userId: user.id, newToken: newCartToken() });
  });
  if (merged.token) ctx.setCookie(CART_COOKIE, merged.token, cartCookieOptions);
  // Deux codes différents : celui du panier invité gagne, et le client doit
  // savoir que l'autre a été retiré (HEP-49). Le panier lit ce cookie.
  if (merged.replacedDiscountCode) {
    ctx.setCookie(CART_NOTICE_COOKIE, merged.replacedDiscountCode, cartNoticeCookieOptions);
  }
});

// --- Configuration -----------------------------------------------------------

export const auth = betterAuth({
  appName: "Héphaïstos",
  baseURL,
  trustedOrigins: vercelOrigins(),
  database: prismaAdapter(db, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    // Pas de session tant que l'adresse n'est pas confirmée : sinon n'importe
    // qui ouvre un compte au nom d'un autre et reçoit ses factures.
    requireEmailVerification: true,
    // 12 caractères : le minimum ANSSI pour un mot de passe seul. Le hachage
    // est celui de Better Auth (scrypt), jamais remplacé.
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    // Une heure, et à usage unique : Better Auth consomme le jeton au premier
    // changement de mot de passe réussi.
    resetPasswordTokenExpiresIn: 60 * 60,
    /**
     * Inscription avec une adresse déjà inscrite. La réponse HTTP est
     * identique à une vraie inscription (Better Auth, parce que la
     * vérification d'email est requise) : rien ne dit à l'auteur que
     * l'adresse est en base. C'est le titulaire qui est prévenu, par email.
     */
    onExistingUserSignUp: async ({ user }) => {
      deliverInBackground(
        accountEmail({
          to: user.email,
          subject: "Vous avez déjà un compte Héphaïstos",
          intro:
            "Quelqu'un — vous, sans doute — a voulu créer un compte avec cette adresse. Elle a déjà un compte.",
          cta: "Me connecter",
          url: `${baseURL ?? ""}/connexion`,
          outro:
            "Mot de passe oublié ? Le lien « Mot de passe oublié » de la page de connexion vous en fera choisir un nouveau. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
        }),
      );
    },
    sendResetPassword: async ({ user, url }) => {
      deliverInBackground(
        accountEmail({
          to: user.email,
          subject: "Réinitialiser votre mot de passe",
          intro:
            "Vous avez demandé à réinitialiser le mot de passe de votre compte Héphaïstos.",
          cta: "Choisir un nouveau mot de passe",
          url,
          outro:
            "Ce lien est valable une heure. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.",
        }),
      );
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    // Une connexion refusée faute de vérification renvoie le lien : un client
    // qui a perdu le premier mail n'a pas à chercher un bouton « renvoyer ».
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: ONE_DAY,
    // L'adresse vient d'être prouvée : c'est le seul moment où rattacher les
    // commandes passées sans compte est sûr (HEP-63). La connexion le refait,
    // pour les commandes passées en invité depuis.
    afterEmailVerification: async (user) => {
      await attachGuestOrders(db, user);
    },
    sendVerificationEmail: async ({ user, url }) => {
      deliverInBackground(
        accountEmail({
          to: user.email,
          subject: "Confirmez votre adresse email",
          intro: "Bienvenue chez Héphaïstos. Il reste une étape : confirmer votre adresse.",
          cta: "Confirmer mon adresse",
          url,
          outro:
            "Ce lien est valable 24 heures. Si vous n'avez pas créé de compte, ignorez ce message.",
        }),
      );
    },
  },

  user: {
    additionalFields: {
      /**
       * `input: false` est la ligne qui compte : sans elle, un
       * `{ "role": "admin" }` glissé dans le corps de l'inscription ferait un
       * administrateur. Un admin se nomme en base, jamais par l'API.
       */
      role: {
        type: "string",
        required: false,
        defaultValue: "customer",
        input: false,
      },
    },
  },

  session: {
    // 30 jours glissants : la session est prolongée au plus une fois par
    // jour d'activité (rotation de l'expiration, le jeton reste en base et
    // révocable). Une session admin est en plus bornée à 8 h et coupée après
    // 30 min d'inactivité, par `admin-guard.ts` (HEP-78).
    expiresIn: THIRTY_DAYS,
    updateAge: ONE_DAY,
    additionalFields: {
      // Écrit par la garde d'administration (HEP-78), jamais par le client.
      lastActiveAt: { type: "date", required: false, input: false },
    },
    // Pas de `cookieCache` : chaque requête relit la session en base. Une
    // session révoquée (mot de passe changé, compte supprimé) cesse donc de
    // fonctionner immédiatement, et non quelques minutes plus tard.
  },

  advanced: {
    cookiePrefix: "hep",
    // `Secure` partout où le site est servi en HTTPS, c'est-à-dire hors
    // local. `httpOnly` et `SameSite=Lax` sont les valeurs par défaut,
    // écrites ici pour qu'aucune montée de version ne les change en silence.
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
  },

  hooks: { before: rateLimitHook, after: afterSessionHook },

  plugins: [
    // TOTP (application d'authentification). Obligatoire pour un admin,
    // optionnel pour un client : la règle est dans `requireAdmin()`.
    twoFactor({ issuer: "Héphaïstos" }),
    // Toujours en dernier : pose les cookies quand une Server Action appelle
    // `auth.api.*`.
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
