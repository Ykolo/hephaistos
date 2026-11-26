import { subscribeNewsletter } from "@/server/actions/newsletter";

/**
 * Inscription newsletter (HEP-67), en Route Handler plutôt qu'en Server
 * Action appelée depuis la page.
 *
 * Le formulaire est sur une dizaine de pages (accueil, boutique, fiches
 * produit…). Une Server Action est un POST sur l'URL de la page : il aurait
 * fallu déclarer chacune dans BotID (`instrumentation-client.ts`), et toutes
 * leurs autres actions — l'ajout au panier en tête — auraient payé un défi
 * BotID à chaque clic. Ici, une seule URL protégée.
 *
 * Le corps passe par la même action : schéma, BotID, quota et contrat
 * d'erreur identiques.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, code: "VALIDATION", message: "Requête invalide." }, { status: 400 });
  }
  const result = await subscribeNewsletter(body);
  const status = result.ok ? 200 : result.code === "RATE_LIMITED" ? 429 : result.code === "BOT_DETECTED" ? 403 : 400;
  return Response.json(result, { status });
}
