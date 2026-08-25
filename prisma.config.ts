import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Configuration Prisma CLI (Migrate, Studio, seed).
 *
 * Prisma 7 ne lit plus les chaînes de connexion depuis `schema.prisma` : elles
 * vivent ici pour les commandes de migration, et dans l'adapter du client pour
 * le runtime (`src/server/db.ts`).
 *
 * Migrate utilise la chaîne **directe** (`DIRECT_URL`) et non la poolée : le
 * pooler Neon ne supporte pas les verrous consultatifs dont les migrations ont
 * besoin, et `migrate dev` doit pouvoir créer puis détruire une shadow
 * database. En local et en CI, `DIRECT_URL` pointe simplement sur le Postgres
 * jetable (`bun run db:local:up`).
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
