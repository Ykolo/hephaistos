import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { confirmSubscription } from "@/server/services/newsletter";

/**
 * Lien du mail de confirmation (HEP-67) : passe l'inscription en
 * `CONFIRMED`, horodatée, puis redirige vers une page qui dit ce qui s'est
 * passé. L'adresse n'apparaît jamais dans l'URL, seulement le jeton.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const result = await confirmSubscription(db, token);
  return NextResponse.redirect(new URL(`/newsletter/confirmation?etat=${result}`, request.url), 303);
}
