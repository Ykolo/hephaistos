import { db } from "@/server/db";
import { purgeStalePending } from "@/server/services/newsletter";
import { captureCritical } from "@/server/observability";

/**
 * Purge des inscriptions jamais confirmées (HEP-67), une fois par jour.
 *
 * Sans clic de confirmation, il n'y a pas de consentement : garder l'adresse
 * au-delà de 30 jours n'aurait aucune base légale. Même protection que le cron
 * des réservations — signé par `CRON_SECRET`, refusé en production sans lui.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return Response.json({ error: "Non autorisé." }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "CRON_SECRET n'est pas configuré." }, { status: 500 });
  }

  try {
    const purged = await purgeStalePending(db);
    return Response.json({ ok: true, purged, at: new Date().toISOString() });
  } catch (error) {
    captureCritical("cron", error, { cron: "newsletter" });
    return Response.json({ ok: false, error: "La purge a échoué." }, { status: 500 });
  }
}
