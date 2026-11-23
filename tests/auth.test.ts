import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { assertAdmin, assertUser } from "@/server/auth-guards";
import { outboxForTests } from "@/server/email";
import { ActionError } from "@/server/errors";
import { resetRateLimitsForTests } from "@/server/ratelimit";
import { testDb } from "./helpers/db";

/**
 * Authentification (HEP-62) — la definition of done, cas par cas :
 * un compte se crée, se vérifie par mail et sert à se connecter ;
 * `requireAdmin()` refuse un utilisateur connecté sans le rôle.
 */

const PASSWORD = "un mot de passe solide";
const EMAIL_DOMAIN = "@hep62.example.test";

function newEmail(): string {
  return `auth-${crypto.randomUUID().slice(0, 8)}${EMAIL_DOMAIN}`;
}

/** Une IP par test : les quotas par IP ne doivent pas déborder d'un cas à l'autre. */
function requestHeaders(): Headers {
  const n = () => Math.floor(Math.random() * 250) + 1;
  return new Headers({ "x-real-ip": `10.${n()}.${n()}.${n()}` });
}

async function signUp(email: string, headers = requestHeaders()) {
  return auth.api.signUpEmail({
    body: { name: "Cliente de test", email, password: PASSWORD },
    headers,
  });
}

/** Lien de vérification « envoyé » à `email`, lu dans la boîte d'envoi de test. */
function verificationToken(email: string): string {
  const message = [...outboxForTests()]
    .reverse()
    .find((m) => m.to === email && m.subject.startsWith("Confirmez"));
  if (!message) throw new Error(`Aucun email de vérification pour ${email}`);
  const url = message.text.match(/https?:\/\/\S+/)?.[0];
  const token = url && new URL(url).searchParams.get("token");
  if (!token) throw new Error("Lien de vérification sans jeton");
  return token;
}

async function signUpAndVerify(email: string) {
  await signUp(email);
  await auth.api.verifyEmail({ query: { token: verificationToken(email) } });
}

/** Connexion, puis cookie de session prêt à renvoyer. */
async function signIn(email: string, headers = requestHeaders()) {
  const response = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    headers,
    asResponse: true,
  });
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie.match(/hep\.session_token=[^;]+/)?.[0];
  return { response, setCookie, cookie };
}

async function sessionFor(cookie: string) {
  return auth.api.getSession({ headers: new Headers({ cookie }) });
}

/** Code d'erreur de Better Auth, quelle que soit la forme de l'exception. */
async function rejection(promise: Promise<unknown>): Promise<{ status?: unknown; code?: unknown }> {
  try {
    await promise;
  } catch (error) {
    const e = error as { status?: unknown; body?: { code?: unknown } };
    return { status: e.status, code: e.body?.code };
  }
  throw new Error("L'appel aurait dû échouer.");
}

beforeEach(() => {
  resetRateLimitsForTests();
});

afterAll(async () => {
  // Sessions, comptes et secrets TOTP partent en cascade.
  await testDb.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await testDb.$disconnect();
});

describe("inscription et vérification d'email", () => {
  it("crée un compte client non vérifié et envoie le lien", async () => {
    const email = newEmail();
    const result = await signUp(email);

    // Pas de session avant la vérification.
    expect(result.token).toBeNull();

    const user = await testDb.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerified).toBe(false);
    expect(user.role).toBe("customer");

    const account = await testDb.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(account.providerId).toBe("credential");
    // Haché (scrypt), jamais en clair.
    expect(account.password).not.toContain(PASSWORD);

    expect(() => verificationToken(email)).not.toThrow();
  });

  it("refuse la connexion tant que l'adresse n'est pas confirmée", async () => {
    const email = newEmail();
    await signUp(email);

    const error = await rejection(
      auth.api.signInEmail({ body: { email, password: PASSWORD }, headers: requestHeaders() }),
    );
    expect(error.status).toBe("FORBIDDEN");
    expect(error.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("refuse un mot de passe de moins de 12 caractères", async () => {
    const error = await rejection(
      auth.api.signUpEmail({
        body: { name: "Trop court", email: newEmail(), password: "court1234" },
        headers: requestHeaders(),
      }),
    );
    expect(error.code).toBe("PASSWORD_TOO_SHORT");
  });

  it("ignore ou refuse un rôle glissé dans l'inscription", async () => {
    const email = newEmail();
    await auth.api
      .signUpEmail({
        body: { name: "Pirate", email, password: PASSWORD, role: "admin" } as never,
        headers: requestHeaders(),
      })
      .catch(() => undefined);

    const user = await testDb.user.findUnique({ where: { email } });
    // Soit le compte n'existe pas, soit il est client — jamais admin.
    expect(user?.role ?? "customer").toBe("customer");
  });
});

describe("connexion et session", () => {
  it("se connecte après vérification, avec un cookie httpOnly et SameSite=Lax", async () => {
    const email = newEmail();
    await signUpAndVerify(email);

    const { response, setCookie, cookie } = await signIn(email);
    expect(response.status).toBe(200);
    expect(cookie).toBeDefined();
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    // Ni `Secure` ni durée fixe à vérifier ici : `Secure` dépend de
    // NODE_ENV=production, et la durée est celle de la session.

    const session = await sessionFor(cookie!);
    expect(session?.user.email).toBe(email);

    // 30 jours, à la minute près.
    const days = (new Date(session!.session.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("stocke la session en base : un nouveau processus la retrouve", async () => {
    const email = newEmail();
    await signUpAndVerify(email);
    const { cookie } = await signIn(email);

    const user = await testDb.user.findUniqueOrThrow({ where: { email } });
    expect(await testDb.session.count({ where: { userId: user.id } })).toBeGreaterThan(0);

    // Une session supprimée en base cesse aussitôt de fonctionner : il n'y a
    // pas de cache de cookie qui la ferait survivre quelques minutes.
    await testDb.session.deleteMany({ where: { userId: user.id } });
    expect(await sessionFor(cookie!)).toBeNull();
  });
});

describe("requireAdmin / requireUser", () => {
  it("refuse l'absence de session", () => {
    expect(() => assertUser(null)).toThrow(ActionError);
    expect(() => assertAdmin(null)).toThrow(/Connectez-vous/);
  });

  it("refuse un client connecté, accepte un admin avec double authentification", async () => {
    const email = newEmail();
    await signUpAndVerify(email);
    const { cookie } = await signIn(email);

    const asCustomer = await sessionFor(cookie!);
    expect(assertUser(asCustomer).user.email).toBe(email);
    try {
      assertAdmin(asCustomer);
      throw new Error("assertAdmin aurait dû refuser");
    } catch (error) {
      expect(error).toBeInstanceOf(ActionError);
      expect((error as ActionError).code).toBe("FORBIDDEN");
    }

    // Promu sans TOTP : toujours refusé.
    await testDb.user.update({ where: { email }, data: { role: "admin" } });
    const asAdminWithout2fa = await sessionFor(cookie!);
    expect(asAdminWithout2fa?.user.role).toBe("admin");
    expect(() => assertAdmin(asAdminWithout2fa)).toThrow(/double authentification/);

    // TOTP activé : accepté.
    await testDb.user.update({ where: { email }, data: { twoFactorEnabled: true } });
    const asAdmin = await sessionFor(cookie!);
    expect(assertAdmin(asAdmin).user.role).toBe("admin");
  });
});

describe("limitation des tentatives de connexion", () => {
  it("bloque la 6e tentative sur un même compte, même depuis des IP différentes", async () => {
    const email = newEmail();
    await signUpAndVerify(email);

    for (let i = 0; i < 5; i++) {
      const error = await rejection(
        auth.api.signInEmail({
          body: { email, password: "mauvais mot de passe" },
          headers: requestHeaders(),
        }),
      );
      expect(error.status).toBe("UNAUTHORIZED");
    }

    const blocked = await rejection(
      auth.api.signInEmail({ body: { email, password: PASSWORD }, headers: requestHeaders() }),
    );
    expect(blocked.status).toBe("TOO_MANY_REQUESTS");
  });

  it("bloque la 6e tentative depuis une même IP, même sur des comptes différents", async () => {
    const headers = requestHeaders();
    for (let i = 0; i < 5; i++) {
      await rejection(
        auth.api.signInEmail({ body: { email: newEmail(), password: PASSWORD }, headers }),
      );
    }
    const blocked = await rejection(
      auth.api.signInEmail({ body: { email: newEmail(), password: PASSWORD }, headers }),
    );
    expect(blocked.status).toBe("TOO_MANY_REQUESTS");
  });
});
