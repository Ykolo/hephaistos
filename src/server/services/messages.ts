import type { MessageStatus, Prisma } from "@/generated/prisma/client";
import type { Tx } from "../db";
import { ActionError } from "../errors";
import { escapeHtml, sendEmail, type EmailMessage } from "../email";
import { captureError } from "../observability";
import type { ContactInput } from "@/lib/validation/contact";

/**
 * Messages du formulaire de contact (HEP-89).
 *
 * **La base est l'enregistrement de référence, le mail n'est qu'une
 * notification.** Un souci de délivrabilité ne doit jamais faire perdre un
 * message : il est écrit d'abord, notifié ensuite, et un échec d'envoi
 * n'annule rien. C'est aussi ce qui permet de répondre à « je vous ai écrit
 * il y a trois semaines ».
 */

/** Annoncé au client dans l'accusé de réception et sur la page contact. */
export const CONTACT_REPLY_DELAY = "sous 48 heures ouvrées";

export function contactInbox(): string {
  return process.env.CONTACT_INBOX_EMAIL || "contact@hephaistosparis.com";
}

export type StoredMessage = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  subject: string;
  body: string;
  createdAt: Date;
};

const storedSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  subject: true,
  body: true,
  createdAt: true,
} as const;

export async function storeContactMessage(
  db: Tx,
  input: Omit<ContactInput, "website">,
  meta: { ipHash: string | null },
): Promise<StoredMessage> {
  return db.message.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      subject: input.subject,
      body: input.body,
      ipHash: meta.ipHash,
    },
    select: storedSelect,
  });
}

function paragraphs(text: string): string {
  return escapeHtml(text).replaceAll("\n", "<br>");
}

/** Notification à la marque. « Répondre » écrit au client. */
export function contactNotificationEmail(message: StoredMessage): EmailMessage {
  const name = `${message.firstName} ${message.lastName}`;
  const text = `Nouveau message de ${name} <${message.email}>

Sujet : ${message.subject}

${message.body}

—
Répondre à ce mail écrit directement à ${message.email}.
Le message est aussi dans l'administration, rubrique Messages.`;
  const html = `<!doctype html><html lang="fr"><body style="font-family:Georgia,serif;color:#1a1a1a;line-height:1.6">
<p><strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(message.email)}&gt;</p>
<p><strong>Sujet :</strong> ${escapeHtml(message.subject)}</p>
<p>${paragraphs(message.body)}</p>
<p style="font-size:13px;color:#555">Répondre à ce mail écrit directement à ${escapeHtml(message.email)}. Le message est aussi dans l'administration, rubrique Messages.</p>
</body></html>`;
  return {
    to: contactInbox(),
    subject: `Contact — ${message.subject}`,
    text,
    html,
    replyTo: message.email,
  };
}

/** Accusé de réception au client, avec le délai de réponse annoncé. */
export function contactAcknowledgementEmail(message: StoredMessage): EmailMessage {
  const intro = `Bonjour ${message.firstName},

Nous avons bien reçu votre message et nous vous répondrons ${CONTACT_REPLY_DELAY}.`;
  const text = `${intro}

Votre message :
« ${message.subject} »
${message.body}

L'équipe Héphaïstos`;
  const html = `<!doctype html><html lang="fr"><body style="font-family:Georgia,serif;color:#1a1a1a;line-height:1.6">
<p>Bonjour ${escapeHtml(message.firstName)},</p>
<p>Nous avons bien reçu votre message et nous vous répondrons ${CONTACT_REPLY_DELAY}.</p>
<p style="font-size:13px;color:#555">Votre message :<br><strong>${escapeHtml(message.subject)}</strong><br>${paragraphs(message.body)}</p>
<p>L'équipe Héphaïstos</p>
</body></html>`;
  return {
    to: message.email,
    subject: "Nous avons bien reçu votre message",
    text,
    html,
    replyTo: contactInbox(),
  };
}

/**
 * Notifie la marque et accuse réception.
 *
 * Les deux envois sont indépendants : l'échec de l'un n'empêche pas l'autre,
 * et aucun ne remonte au visiteur — son message est déjà en base. L'échec
 * part chez Sentry (`sendEmail` alerte déjà sur un refus de Resend).
 */
export async function notifyContactMessage(
  message: StoredMessage,
  send: (m: EmailMessage) => Promise<void> = sendEmail,
): Promise<{ notified: boolean; acknowledged: boolean }> {
  const [notified, acknowledged] = await Promise.all(
    [contactNotificationEmail(message), contactAcknowledgementEmail(message)].map((mail) =>
      send(mail).then(
        () => true,
        (error: unknown) => {
          captureError(error, { action: "contact.notify", messageId: message.id });
          return false;
        },
      ),
    ),
  );
  return { notified, acknowledged };
}

// --- Boîte de réception (admin) ----------------------------------------------

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  NEW: "Nouveau",
  READ: "Lu",
  ANSWERED: "Répondu",
  ARCHIVED: "Archivé",
  SPAM: "Spam",
};

export const INBOX_PAGE_SIZE = 30;

export async function listMessages(
  db: Tx,
  search: { status?: MessageStatus | null; q?: string | null; page?: number },
) {
  const q = search.q?.trim();
  const where: Prisma.MessageWhereInput = {
    // Sans filtre : tout sauf le spam, qui n'a rien à faire dans la pile du jour.
    status: search.status ?? { not: "SPAM" },
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { subject: { contains: q, mode: "insensitive" } },
            { body: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const page = Math.max(1, search.page ?? 1);

  const [items, total, counts] = await Promise.all([
    db.message.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * INBOX_PAGE_SIZE,
      take: INBOX_PAGE_SIZE,
      select: { ...storedSelect, status: true },
    }),
    db.message.count({ where }),
    db.message.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<
    Record<MessageStatus, number>
  >;
  return { items, total, page, byStatus };
}

export async function getMessage(db: Tx, id: string) {
  return db.message.findUnique({ where: { id }, select: { ...storedSelect, status: true } });
}

/** Nombre de messages à traiter, pour la navigation de l'admin. */
export async function countNewMessages(db: Tx): Promise<number> {
  return db.message.count({ where: { status: "NEW" } });
}

/**
 * Change l'état d'un message, et l'inscrit au journal.
 *
 * Pas de suppression : un message est une pièce d'un échange avec un client,
 * possiblement d'un litige. Le spam s'écarte, il ne s'efface pas.
 */
export async function setMessageStatus(
  tx: Tx,
  id: string,
  status: MessageStatus,
  actorId: string,
): Promise<void> {
  const current = await tx.message.findUnique({ where: { id }, select: { status: true } });
  if (!current) throw new ActionError("NOT_FOUND", "Ce message est introuvable.");
  if (current.status === status) return;

  await tx.message.update({ where: { id }, data: { status } });
  await tx.auditLog.create({
    data: {
      actorId,
      entity: "Message",
      entityId: id,
      action: "status",
      diff: { from: current.status, to: status },
    },
  });
}
