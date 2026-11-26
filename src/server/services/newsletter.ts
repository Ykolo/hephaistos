import { randomBytes } from "node:crypto";
import type { Tx } from "../db";
import { escapeHtml, type EmailMessage } from "../email";

/**
 * Newsletter en double opt-in (HEP-67).
 *
 * Le consentement se prouve en deux temps : la saisie sur le site (date,
 * emplacement, IP hachée) puis le clic dans le mail de confirmation. Seul ce
 * second clic fait entrer l'adresse dans la liste : une adresse tapée par
 * erreur, ou par un tiers, n'y entre jamais.
 *
 * Aucune réponse ne dit si une adresse est déjà connue : inscrite, en attente
 * ou désinscrite, le visiteur lit le même message.
 */

/** Durée de validité du lien de confirmation. */
export const CONFIRM_TTL_DAYS = 7;

/** Une inscription jamais confirmée est effacée au bout de ce délai : sans clic, pas de consentement à garder. */
export const PENDING_RETENTION_DAYS = 30;

/**
 * Un même lien n'est pas renvoyé plus d'une fois par ce délai : sans ce
 * frein, le formulaire servirait à bombarder la boîte d'un tiers.
 */
export const RESEND_COOLDOWN_MINUTES = 10;

export const NEWSLETTER_SOURCES = ["band", "hero", "produit", "menu", "checkout"] as const;
export type NewsletterSource = (typeof NEWSLETTER_SOURCES)[number];

/** 32 octets, comme le jeton de suivi des commandes : hors de portée d'une énumération. */
function token(): string {
  return randomBytes(32).toString("base64url");
}

const DAY = 24 * 60 * 60 * 1000;

export type SubscribeOutcome =
  /** Mail de confirmation à envoyer. */
  | { send: true; confirmToken: string; unsubToken: string }
  /** Rien à envoyer : déjà inscrit, ou lien envoyé il y a moins de 10 min. */
  | { send: false };

export async function subscribe(
  db: Tx,
  input: {
    email: string;
    source: NewsletterSource | null;
    ipHash: string | null;
    userAgent: string | null;
  },
  now: Date = new Date(),
): Promise<SubscribeOutcome> {
  const expires = new Date(now.getTime() + CONFIRM_TTL_DAYS * DAY);
  const proof = {
    source: input.source,
    consentAt: now,
    ipHash: input.ipHash,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
  };

  const existing = await db.subscriber.findUnique({
    where: { email: input.email },
    select: { id: true, status: true, unsubToken: true, tokenExpiresAt: true },
  });

  if (existing?.status === "CONFIRMED") return { send: false };

  if (existing?.status === "PENDING" && existing.tokenExpiresAt) {
    const issuedAt = existing.tokenExpiresAt.getTime() - CONFIRM_TTL_DAYS * DAY;
    if (now.getTime() - issuedAt < RESEND_COOLDOWN_MINUTES * 60 * 1000) return { send: false };
  }

  const confirmToken = token();

  if (existing) {
    // Désinscrit ou en échec qui revient, ou attente renouvelée : nouveau
    // consentement, nouveau lien. L'ancien lien de confirmation meurt.
    await db.subscriber.update({
      where: { id: existing.id },
      data: { ...proof, status: "PENDING", confirmedAt: null, confirmToken, tokenExpiresAt: expires },
    });
    return { send: true, confirmToken, unsubToken: existing.unsubToken };
  }

  const unsubToken = token();
  await db.subscriber.create({
    data: {
      ...proof,
      email: input.email,
      status: "PENDING",
      confirmToken,
      unsubToken,
      tokenExpiresAt: expires,
    },
  });
  return { send: true, confirmToken, unsubToken };
}

export type ConfirmResult = "confirmed" | "already" | "expired" | "invalid";

export async function confirmSubscription(
  db: Tx,
  rawToken: string | null,
  now: Date = new Date(),
): Promise<ConfirmResult> {
  if (!rawToken || rawToken.length > 100) return "invalid";
  const sub = await db.subscriber.findUnique({
    where: { confirmToken: rawToken },
    select: { id: true, status: true, tokenExpiresAt: true },
  });
  if (!sub) return "invalid";
  if (sub.status === "CONFIRMED") return "already";
  if (!sub.tokenExpiresAt || sub.tokenExpiresAt <= now) return "expired";

  // Le jeton n'est pas effacé : un second clic (ou l'aperçu d'un client mail)
  // doit répondre « déjà confirmée », pas « lien invalide ».
  await db.subscriber.update({
    where: { id: sub.id },
    data: { status: "CONFIRMED", confirmedAt: now },
  });
  return "confirmed";
}

export type UnsubscribeResult = "unsubscribed" | "already" | "invalid";

export async function unsubscribe(db: Tx, rawToken: string | null): Promise<UnsubscribeResult> {
  if (!rawToken || rawToken.length > 100) return "invalid";
  const sub = await db.subscriber.findUnique({
    where: { unsubToken: rawToken },
    select: { id: true, status: true },
  });
  if (!sub) return "invalid";
  if (sub.status === "UNSUBSCRIBED") return "already";
  // Le jeton de confirmation tombe : un vieux lien ne doit pas réinscrire.
  await db.subscriber.update({
    where: { id: sub.id },
    data: { status: "UNSUBSCRIBED", confirmToken: null, tokenExpiresAt: null },
  });
  return "unsubscribed";
}

/** Purge quotidienne des inscriptions jamais confirmées. */
export async function purgeStalePending(db: Tx, now: Date = new Date()): Promise<number> {
  const { count } = await db.subscriber.deleteMany({
    where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - PENDING_RETENTION_DAYS * DAY) } },
  });
  return count;
}

/** Le mail « confirme ton inscription ». Les liens ne contiennent que des jetons, jamais l'adresse. */
export function confirmationEmail(opts: {
  to: string;
  confirmUrl: string;
  /** Page de désinscription, pour un humain. */
  unsubUrl: string;
  /** Point d'entrée POST de la désinscription en un clic (RFC 8058), pour la boîte mail. */
  unsubPostUrl: string;
}): EmailMessage {
  const text = `Confirme ton inscription à la liste Héphaïstos :

${opts.confirmUrl}

Ce lien est valable ${CONFIRM_TTL_DAYS} jours. Sans clic, ton adresse ne rejoint pas la liste et sera effacée.

Ce n'est pas toi ? Ignore ce mail, ou retire ton adresse : ${opts.unsubUrl}`;
  const html = `<!doctype html><html lang="fr"><body style="font-family:Georgia,serif;color:#1a1a1a;line-height:1.6">
<p>Une dernière étape pour rejoindre ceux qui se forgent.</p>
<p><a href="${escapeHtml(opts.confirmUrl)}" style="display:inline-block;padding:10px 18px;background:#1a1a1a;color:#fff;text-decoration:none">Confirmer mon inscription</a></p>
<p style="font-size:13px;color:#555">Ce lien est valable ${CONFIRM_TTL_DAYS} jours. Sans clic, ton adresse ne rejoint pas la liste et sera effacée.</p>
<p style="font-size:12px;color:#777">Ce n'est pas toi ? Ignore ce mail, ou <a href="${escapeHtml(opts.unsubUrl)}" style="color:#777">retire ton adresse</a>.</p>
</body></html>`;
  return {
    to: opts.to,
    subject: "Confirme ton inscription",
    text,
    html,
    headers: {
      // Désinscription en un clic depuis la boîte mail (RFC 8058) : Gmail et
      // Yahoo l'exigent des expéditeurs en volume.
      "List-Unsubscribe": `<${opts.unsubPostUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
