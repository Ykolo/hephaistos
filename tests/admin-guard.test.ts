import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";

/**
 * HEP-78 — accès à l'administration. La definition of done, cas par cas :
 * `/admin` sans session renvoie vers la connexion sans rien divulguer ; un
 * admin sans TOTP n'entre pas ; une Server Action d'admin appelée par un
 * client échoue ; toute modification laisse une trace dans le journal.
 */

// Les gardes lisent les en-têtes de la requête courante. Hors de Next, on les
// fournit à la main : chaque test pose le cookie de la session qu'il incarne.
let currentHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => currentHeaders }));
// `updateTag` exige un contexte de requête Next ; l'invalidation du cache
// catalogue n'est pas ce qu'on teste ici.
vi.mock("next/cache", async (original) => ({
  ...(await original<typeof import("next/cache")>()),
  updateTag: () => {},
}));

const { auth } = await import("@/server/auth");
const {
  ADMIN_IDLE_TIMEOUT_MS,
  ADMIN_SESSION_MAX_AGE_MS,
  checkAdminAccess,
  denialRedirect,
  evaluateAdminAccess,
  isSafeAdminPath,
  requireAdminAction,
} = await import("@/server/admin-guard");
const { saveOrderNote } = await import("@/server/actions/admin-orders");
const { reorder } = await import("@/server/actions/admin-products");
const { outboxForTests } = await import("@/server/email");
const { resetRateLimitsForTests } = await import("@/server/ratelimit");
const { testDb } = await import("./helpers/db");

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

const PASSWORD = "un mot de passe solide";
const EMAIL_DOMAIN = "@hep78.example.test";

function newEmail() {
  return `admin-${crypto.randomUUID().slice(0, 8)}${EMAIL_DOMAIN}`;
}

function ip() {
  const n = () => Math.floor(Math.random() * 250) + 1;
  return new Headers({ "x-real-ip": `10.${n()}.${n()}.${n()}` });
}

/** Compte vérifié et connecté ; renvoie le cookie de session. */
async function signedInAccount(email = newEmail()) {
  await auth.api.signUpEmail({ body: { name: "Admin de test", email, password: PASSWORD }, headers: ip() });
  const message = [...outboxForTests()].reverse().find((m) => m.to === email);
  const token = new URL(message!.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
  await auth.api.verifyEmail({ query: { token } });
  const response = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    headers: ip(),
    asResponse: true,
  });
  const cookie = response.headers.get("set-cookie")!.match(/hep\.session_token=[^;]+/)![0];
  return { email, cookie };
}

/**
 * Jeton de session contenu dans le cookie (`<jeton>.<signature>`). Un compte
 * a plusieurs sessions — la vérification d'email en ouvre déjà une — : les
 * assertions ciblent celle du cookie, pas « une session de l'utilisateur ».
 */
function tokenOf(cookie: string): string {
  return decodeURIComponent(cookie.split("=")[1]).split(".")[0];
}

function as(cookie: string) {
  currentHeaders = new Headers({ cookie });
  return currentHeaders;
}

/** Session factice pour la règle pure. */
function fakeSession(overrides: {
  role?: string;
  twoFactorEnabled?: boolean;
  createdAt?: number;
  lastActiveAt?: number | null;
}): Session {
  const now = Date.now();
  return {
    user: {
      id: "u1",
      email: "x@example.test",
      name: "X",
      emailVerified: true,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      role: overrides.role ?? "admin",
      twoFactorEnabled: overrides.twoFactorEnabled ?? true,
    },
    session: {
      id: "s1",
      token: "t",
      userId: "u1",
      expiresAt: new Date(now + 86_400_000),
      createdAt: new Date(overrides.createdAt ?? now),
      updatedAt: new Date(now),
      lastActiveAt:
        overrides.lastActiveAt === null ? null : new Date(overrides.lastActiveAt ?? now),
    },
  } as unknown as Session;
}

beforeEach(() => {
  resetRateLimitsForTests();
  currentHeaders = new Headers();
});

afterAll(async () => {
  await testDb.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await testDb.$disconnect();
});

describe("règle d'accès (sans base)", () => {
  const now = Date.now();

  it("refuse l'absence de session, puis un rôle client, avant tout le reste", () => {
    expect(evaluateAdminAccess(null, now)).toMatchObject({ ok: false, reason: "no-session" });
    // Un client sans TOTP apprend « pas admin », jamais « TOTP manquant ».
    const customer = fakeSession({ role: "customer", twoFactorEnabled: false });
    expect(evaluateAdminAccess(customer, now)).toMatchObject({ ok: false, reason: "not-admin" });
  });

  it("exige le TOTP, sauf sur l'écran qui sert à l'activer", () => {
    const admin = fakeSession({ twoFactorEnabled: false });
    expect(evaluateAdminAccess(admin, now)).toMatchObject({ ok: false, reason: "no-2fa" });
    expect(evaluateAdminAccess(admin, now, { allowWithout2fa: true }).ok).toBe(true);
  });

  it("coupe au-delà de 8 h, même avec de l'activité", () => {
    const old = fakeSession({ createdAt: now - ADMIN_SESSION_MAX_AGE_MS - 1000, lastActiveAt: now });
    expect(evaluateAdminAccess(old, now)).toMatchObject({ ok: false, reason: "expired" });
  });

  it("coupe après 30 min sans activité", () => {
    const idle = fakeSession({
      createdAt: now - 2 * ADMIN_IDLE_TIMEOUT_MS,
      lastActiveAt: now - ADMIN_IDLE_TIMEOUT_MS - 1000,
    });
    expect(evaluateAdminAccess(idle, now)).toMatchObject({ ok: false, reason: "idle" });
    // Sans activité enregistrée, on compte depuis la connexion.
    const neverSeen = fakeSession({ createdAt: now - ADMIN_IDLE_TIMEOUT_MS - 1000, lastActiveAt: null });
    expect(evaluateAdminAccess(neverSeen, now)).toMatchObject({ ok: false, reason: "idle" });
  });

  it("redirige vers la connexion sans rien divulguer, 404 pour un client", () => {
    expect(denialRedirect("no-session", "/admin/commandes")).toBe("/admin/connexion?suite=%2Fadmin%2Fcommandes");
    expect(denialRedirect("idle")).toBe("/admin/connexion?raison=inactivite");
    expect(denialRedirect("no-2fa")).toBe("/admin/securite");
    expect(denialRedirect("not-admin")).toBeNull();
  });

  it("n'accepte comme retour après connexion qu'une page d'administration", () => {
    expect(isSafeAdminPath("/admin/commandes?filtre=a-expedier")).toBe(true);
    expect(isSafeAdminPath("https://pirate.example/admin")).toBe(false);
    expect(isSafeAdminPath("//pirate.example/admin")).toBe(false);
    expect(isSafeAdminPath("/boutique")).toBe(false);
    expect(denialRedirect("no-session", "https://pirate.example")).toBe("/admin/connexion");
  });
});

describe("garde sur une vraie session", () => {
  it("une Server Action d'admin appelée par un client échoue", async () => {
    const { cookie } = await signedInAccount();
    as(cookie);
    const result = await saveOrderNote({ orderId: crypto.randomUUID(), note: "test" });
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("sans session, l'action répond UNAUTHENTICATED", async () => {
    const result = await saveOrderNote({ orderId: crypto.randomUUID(), note: "test" });
    expect(result).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
  });

  it("un admin sans TOTP n'entre pas", async () => {
    const { email, cookie } = await signedInAccount();
    await testDb.user.update({ where: { email }, data: { role: "admin" } });
    as(cookie);
    await expect(requireAdminAction()).rejects.toThrow(/double authentification/);
  });

  it("une session inactive est supprimée en base, pas seulement refusée", async () => {
    const { email, cookie } = await signedInAccount();
    await testDb.user.update({ where: { email }, data: { role: "admin", twoFactorEnabled: true } });
    const user = await testDb.user.findUniqueOrThrow({ where: { email } });
    await testDb.session.updateMany({
      where: { userId: user.id },
      data: { lastActiveAt: new Date(Date.now() - ADMIN_IDLE_TIMEOUT_MS - 60_000) },
    });

    const access = await checkAdminAccess(as(cookie));
    expect(access).toMatchObject({ ok: false, reason: "idle" });
    expect(await testDb.session.count({ where: { token: tokenOf(cookie) } })).toBe(0);
  });

  it("un admin valide passe, son activité est notée, et son écriture est journalisée", async () => {
    const { email, cookie } = await signedInAccount();
    await testDb.user.update({ where: { email }, data: { role: "admin", twoFactorEnabled: true } });
    const user = await testDb.user.findUniqueOrThrow({ where: { email } });
    as(cookie);

    const { actorId } = await requireAdminAction();
    expect(actorId).toBe(user.id);
    const session = await testDb.session.findUniqueOrThrow({ where: { token: tokenOf(cookie) } });
    expect(session.lastActiveAt).not.toBeNull();

    // Commande inexistante : la garde passe, le service refuse ensuite.
    const missing = await saveOrderNote({ orderId: crypto.randomUUID(), note: "test" });
    expect(missing).toMatchObject({ ok: false, code: "NOT_FOUND" });

    // Une vraie écriture laisse une ligne au journal, au nom de cet admin.
    // Réordonner dans l'ordre actuel : une écriture réelle, sans effet visible.
    const products = await testDb.product.findMany({
      orderBy: { position: "asc" },
      select: { slug: true },
    });
    const saved = await reorder({ slugs: products.map((p) => p.slug) });
    expect(saved).toMatchObject({ ok: true });
    expect(await testDb.auditLog.count({ where: { actorId: user.id } })).toBeGreaterThan(0);
    await testDb.auditLog.deleteMany({ where: { actorId: user.id } });
  });
});

describe("activation du TOTP et connexion en deux étapes", () => {
  it("après activation, le mot de passe seul ne donne plus de session", async () => {
    const { email, cookie } = await signedInAccount();
    await testDb.user.update({ where: { email }, data: { role: "admin" } });

    const enabled = await auth.api.enableTwoFactor({
      body: { password: PASSWORD },
      headers: as(cookie),
    });
    if (enabled.method !== "totp") throw new Error("TOTP attendu");
    const secret = new URL(enabled.totpURI).searchParams.get("secret")!;
    const code = await createOTP(base32.decode(secret), { digits: 6, period: 30 }).totp();
    await auth.api.verifyTOTP({ body: { code }, headers: as(cookie) });

    const user = await testDb.user.findUniqueOrThrow({ where: { email } });
    expect(user.twoFactorEnabled).toBe(true);
    // Le secret est chiffré en base, jamais en clair.
    const stored = await testDb.twoFactor.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.secret).not.toContain(secret);

    const second = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      headers: ip(),
      asResponse: true,
    });
    const body = await second.json();
    expect(body.twoFactorRedirect).toBe(true);
    expect(second.headers.get("set-cookie") ?? "").not.toMatch(/hep\.session_token=[^;]+;/);
  });
});
