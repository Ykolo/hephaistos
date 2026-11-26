"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { newsletterSchema } from "@/lib/validation/contact";
import { action } from "../action";
import { ActionError } from "../errors";
import { RATE_LIMITS } from "../ratelimit";
import { db } from "../db";
import { sendEmail } from "../email";
import { currentIpHash } from "../ip";
import { absoluteUrl } from "../site-url";
import { confirmationEmail, subscribe, unsubscribe } from "../services/newsletter";

/**
 * Inscription à la newsletter (HEP-67) : BotID, quota, schéma, piège à robots,
 * puis inscription en attente et mail de confirmation.
 *
 * La réponse est **la même** quelle que soit la situation de l'adresse —
 * nouvelle, en attente, déjà inscrite : rien ne révèle qu'une adresse est
 * connue. Le mail part après la réponse, pour que le temps de réponse ne le
 * trahisse pas non plus.
 */
export const subscribeNewsletter = action(
  newsletterSchema,
  async (input) => {
    if (input.website) throw new ActionError("BOT_DETECTED", "Requête refusée.");

    const outcome = await subscribe(db, {
      email: input.email,
      source: input.source ?? null,
      ipHash: await currentIpHash(),
      userAgent: (await headers()).get("user-agent"),
    });

    if (outcome.send) {
      const mail = confirmationEmail({
        to: input.email,
        confirmUrl: absoluteUrl(`/api/newsletter/confirm?token=${outcome.confirmToken}`),
        unsubUrl: absoluteUrl(`/desinscription?token=${outcome.unsubToken}`),
        unsubPostUrl: absoluteUrl(`/api/newsletter/unsubscribe?token=${outcome.unsubToken}`),
      });
      // `sendEmail` alerte déjà Sentry sur un échec ; l'inscription reste en
      // attente et le visiteur pourra redemander un lien.
      after(() => sendEmail(mail).catch(() => undefined));
    }

    return { pending: true };
  },
  { name: "newsletter.subscribe", rateLimit: RATE_LIMITS.newsletter, botProtection: true },
);

/** Le bouton de la page `/desinscription`. */
export const unsubscribeNewsletter = action(
  z.object({ token: z.string().min(1).max(100) }),
  async ({ token }) => ({ result: await unsubscribe(db, token) }),
  { name: "newsletter.unsubscribe" },
);
