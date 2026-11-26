import { randomUUID } from "node:crypto";
import type { Tx } from "../db";
import {
  CONSENT_VERSION,
  parseConsent,
  type ConsentAction,
  type ConsentChoice,
  type ConsentState,
} from "@/lib/consent";

/**
 * Preuve du consentement aux cookies (HEP-93).
 *
 * Le cookie dit au navigateur ce qu'il a le droit de charger ; la base garde
 * la **preuve** — date, version de la bannière, catégories, IP hachée — qui
 * doit survivre au navigateur. En cas de contrôle, c'est elle qu'on montre.
 */

/** Ce que la bannière envoie. L'action « fermer » ne peut rien accepter. */
export function choiceFor(action: ConsentAction, custom: ConsentChoice): ConsentChoice {
  switch (action) {
    case "accept_all":
      return { analytics: true, marketing: true };
    case "reject_all":
    case "dismiss":
      return { analytics: false, marketing: false };
    case "custom":
      return custom;
  }
}

export async function recordConsent(
  db: Tx,
  input: {
    /** Identifiant du cookie existant ; absent ou forgé = nouveau. */
    previousCookie: string | null;
    action: ConsentAction;
    choice: ConsentChoice;
    ipHash: string | null;
    userAgent: string | null;
  },
): Promise<ConsentState & { recordId: string }> {
  const choice = choiceFor(input.action, input.choice);
  const consentId = parseConsent(input.previousCookie)?.consentId ?? randomUUID();

  const record = await db.consentRecord.create({
    data: {
      consentId,
      version: CONSENT_VERSION,
      analytics: choice.analytics,
      marketing: choice.marketing,
      action: input.action,
      ipHash: input.ipHash,
      // Tronqué : la preuve n'a besoin que du navigateur, pas d'une empreinte.
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    },
    select: { id: true },
  });

  return { ...choice, consentId, version: CONSENT_VERSION, recordId: record.id };
}

export type ConsentSnapshot = {
  analytics: boolean;
  marketing: boolean;
  at: Date | null;
  recordId: string | null;
};

const NO_CONSENT: ConsentSnapshot = { analytics: false, marketing: false, at: null, recordId: null };

/**
 * L'état à recopier sur une commande au checkout.
 *
 * Le cookie n'est **pas cru sur parole** : il se forge en une ligne de
 * console. Seule la dernière preuve en base pour cet identifiant compte. Pas
 * de preuve, ou une preuve d'une autre version de la bannière : aucun
 * consentement.
 */
export async function consentSnapshot(db: Tx, cookieValue: string | null): Promise<ConsentSnapshot> {
  const parsed = parseConsent(cookieValue);
  if (!parsed) return NO_CONSENT;

  const latest = await db.consentRecord.findFirst({
    where: { consentId: parsed.consentId },
    orderBy: { createdAt: "desc" },
    select: { id: true, version: true, analytics: true, marketing: true, createdAt: true },
  });
  if (!latest || latest.version !== CONSENT_VERSION) return NO_CONSENT;

  return {
    analytics: latest.analytics,
    marketing: latest.marketing,
    at: latest.createdAt,
    recordId: latest.id,
  };
}

/** La preuve attachée à une commande, pour l'admin. */
export async function consentProofForOrder(db: Tx, orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { consentRecordId: true },
  });
  if (!order?.consentRecordId) return null;
  return db.consentRecord.findUnique({ where: { id: order.consentRecordId } });
}
