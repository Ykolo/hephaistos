import { connection } from "next/server";
import { Redis } from "@upstash/redis";
import { db } from "@/server/db";

/**
 * Sonde de disponibilité (HEP-38), appelée par la surveillance externe.
 *
 * Répond 200 si la base répond, 503 sinon. Redis est vérifié mais **ne fait
 * pas tomber la sonde** : le rate limiting échoue ouvert, le site continue de
 * vendre sans lui — ce n'est pas une panne, c'est une dégradation.
 *
 * Ne renvoie aucune information sensible : ni version, ni hôte, ni message
 * d'erreur brut. La route est publique.
 */

const TIMEOUT_MS = 2000;

type Check = { ok: boolean; ms: number } | { ok: null; reason: string };

async function timed(probe: () => Promise<unknown>): Promise<Check> {
  const start = performance.now();
  try {
    await Promise.race([
      probe(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    return { ok: true, ms: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - start) };
  }
}

export async function GET() {
  // Jamais de prérendu ni de cache : une sonde qui répond depuis un cache
  // dirait « tout va bien » pendant une panne.
  await connection();

  const database = await timed(() => db.$queryRaw`SELECT 1`);

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const redis: Check =
    url && token
      ? await timed(() => new Redis({ url, token }).ping())
      : { ok: null, reason: "non configuré" };

  const healthy = database.ok === true;
  return Response.json(
    { ok: healthy, database, redis, at: new Date().toISOString() },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
