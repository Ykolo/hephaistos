import { captureCritical } from "./observability";

/**
 * Envoi d'email transactionnel (HEP-62, en attendant HEP-65 / HEP-66).
 *
 * Volontairement minimal : un appel HTTP à l'API Resend, sans SDK ni gabarit
 * de marque. Les gabarits React Email et la file d'attente avec réessai
 * arrivent avec HEP-66 ; ils remplaceront le corps de `sendEmail` sans que
 * ses appelants changent.
 *
 * Sans `RESEND_API_KEY` :
 * - en local et en test, le message va dans une boîte d'envoi en mémoire et
 *   le lien est affiché dans la console — de quoi tester un parcours complet
 *   sans compte Resend ;
 * - en production, l'envoi **échoue bruyamment** (alerte `email`). Un mail de
 *   vérification qui ne part pas, c'est un client bloqué à l'inscription sans
 *   que personne le sache.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /**
   * Adresse à laquelle « Répondre » écrit. Pour la notification de contact
   * (HEP-89), c'est le client : la marque lui répond depuis sa boîte, sans
   * recopier l'adresse.
   */
  replyTo?: string;
};

const outbox: EmailMessage[] = [];

/** Réservé aux tests : les messages « envoyés » sans Resend. */
export function outboxForTests(): readonly EmailMessage[] {
  return outbox;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      const error = new Error("RESEND_API_KEY absent : email non envoyé.");
      captureCritical("email", error, { subject: message.subject });
      throw error;
    }
    outbox.push(message);
    // Destinataire masqué : même en local, pas d'adresse en clair dans les
    // journaux (cf. sentry-scrub). Le texte contient le lien à ouvrir.
    console.info(`[email] ${message.subject}\n${message.text}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "commandes@hephaistosparis.com",
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const error = new Error(`Resend a refusé l'envoi (HTTP ${response.status}).`);
    captureCritical("email", error, { subject: message.subject });
    throw error;
  }
}

/** Échappe une valeur avant de l'insérer dans le HTML d'un email. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Gabarit commun des emails de compte : un paragraphe et un bouton. */
export function accountEmail(opts: {
  to: string;
  subject: string;
  intro: string;
  cta: string;
  url: string;
  outro: string;
}): EmailMessage {
  const text = `${opts.intro}\n\n${opts.cta} : ${opts.url}\n\n${opts.outro}`;
  const html = `<!doctype html><html lang="fr"><body style="font-family:Georgia,serif;color:#1a1a1a;line-height:1.6">
<p>${escapeHtml(opts.intro)}</p>
<p><a href="${escapeHtml(opts.url)}" style="display:inline-block;padding:10px 18px;background:#1a1a1a;color:#fff;text-decoration:none">${escapeHtml(opts.cta)}</a></p>
<p style="font-size:13px;color:#555">${escapeHtml(opts.outro)}</p>
</body></html>`;
  return { to: opts.to, subject: opts.subject, text, html };
}
