import { db } from "@/server/db";
import { unsubscribe } from "@/server/services/newsletter";

/**
 * Désinscription en un clic depuis la boîte mail (RFC 8058) : Gmail, Yahoo ou
 * Apple Mail envoient un POST sur l'URL de l'en-tête `List-Unsubscribe`.
 *
 * POST seulement : un GET serait déclenché par les antivirus et les aperçus
 * qui ouvrent les liens des mails, et désinscrirait des gens à leur insu.
 * L'humain qui clique dans le mail arrive, lui, sur `/desinscription`.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const result = await unsubscribe(db, token);
  return Response.json({ ok: result !== "invalid" }, { status: result === "invalid" ? 404 : 200 });
}
