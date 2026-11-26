/**
 * Donne le rôle admin à un compte existant (HEP-62).
 *
 *   bun run admin:promote jules@example.com
 *
 * C'est le seul moyen de créer un administrateur : le champ `role` est fermé
 * à l'API (`input: false` dans `src/server/auth.ts`). Le compte doit déjà
 * exister et avoir confirmé son adresse.
 *
 * Le rôle seul ne suffit pas : `requireAdmin()` exige aussi la double
 * authentification. Tant qu'elle n'est pas activée, le compte promu n'a accès
 * à rien.
 *
 * ⚠️ Vérifier la base visée avant de lancer : `DATABASE_URL` décide.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

// Pas d'`await` au niveau supérieur : `tsx` compile ce script en CommonJS.
async function main(): Promise<number> {
  const email = process.argv[2]?.trim().toLowerCase();
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!email) {
    console.error("Usage : bun run admin:promote <email>");
    return 1;
  }
  if (!url) {
    console.error("DATABASE_URL est absent.");
    return 1;
  }

  const adapter = /neon\.(tech|build)/.test(url)
    ? new PrismaNeon({ connectionString: url })
    : new PrismaPg({ connectionString: url });
  const db = new PrismaClient({ adapter });

  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`Aucun compte pour ${email}.`);
      return 1;
    }
    if (!user.emailVerified) {
      console.error(`${email} n'a pas encore confirmé son adresse.`);
      return 1;
    }

    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { role: "admin" } }),
      db.auditLog.create({
        data: {
          actorId: null,
          entity: "User",
          entityId: user.id,
          action: "role.promote",
          diff: { role: { from: user.role, to: "admin" } },
        },
      }),
    ]);

    console.log(
      `${email} est admin.` +
        (user.twoFactorEnabled
          ? ""
          : " Il doit encore activer la double authentification."),
    );
    return 0;
  } finally {
    await db.$disconnect();
  }
}

main().then((code) => process.exit(code));
