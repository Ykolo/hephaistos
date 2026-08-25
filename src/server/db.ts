import { PrismaClient } from "@/generated/prisma/client";

/**
 * Client Prisma unique de l'application.
 *
 * En serverless, l'adapter n'est pas une optimisation mais une nécessité :
 * sans lui, chaque invocation de fonction ouvre une connexion TCP vers Neon,
 * et la base refuse les connexions bien avant que le trafic ne devienne
 * intéressant. L'adapter passe par le driver HTTP/WebSocket de Neon.
 *
 * `DATABASE_URL` doit être la chaîne **poolée** (`-pooler` dans l'hôte).
 * La chaîne directe est réservée aux migrations (cf. `prisma.config.ts`).
 */
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL est absent. Lancez `vercel env pull .env.local` " +
      "ou `bun run db:local:up` pour une base jetable.",
  );
}

/** Neon en preview et production ; Postgres classique en local et en CI. */
async function createAdapter(connectionString: string) {
  if (/neon\.(tech|build)/.test(connectionString)) {
    const { PrismaNeon } = await import("@prisma/adapter-neon");
    return new PrismaNeon({ connectionString });
  }
  const { PrismaPg } = await import("@prisma/adapter-pg");
  return new PrismaPg({ connectionString });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: await createAdapter(url),
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

// En développement, le rechargement à chaud recrée le module à chaque
// modification : sans ce cache, les connexions s'accumulent jusqu'à saturation.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** Type d'une transaction Prisma — ce que reçoivent les services (HEP-34). */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;
