import { cookies } from "next/headers";
import type { Tx } from "./db";
import { consentSnapshot, type ConsentSnapshot } from "./services/consent";
import { CONSENT_COOKIE } from "@/lib/consent";

/**
 * Consentement de la requête courante, vérifié contre la preuve en base
 * (HEP-93). À appeler par le checkout (HEP-58) et à passer à `createOrder` :
 * c'est ce qui permet au webhook, qui n'a pas de cookie, de savoir s'il peut
 * envoyer la conversion à Meta et Google.
 */
export async function currentConsent(db: Tx): Promise<ConsentSnapshot> {
  return consentSnapshot(db, (await cookies()).get(CONSENT_COOKIE)?.value ?? null);
}
