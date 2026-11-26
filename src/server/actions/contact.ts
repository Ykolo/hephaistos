"use server";

import { after } from "next/server";
import { contactSchema } from "@/lib/validation/contact";
import { ActionError } from "../errors";
import { formAction } from "../action";
import { RATE_LIMITS } from "../ratelimit";
import { db } from "../db";
import { currentIpHash } from "../ip";
import {
  CONTACT_REPLY_DELAY,
  notifyContactMessage,
  storeContactMessage,
} from "../services/messages";

/**
 * Envoi du formulaire de contact (HEP-89).
 *
 * Dans l'ordre : BotID, quota (3 envois / 10 min / IP), schéma (longueurs,
 * nombre de liens, piège à robots) — c'est le helper `formAction` — puis
 * **stockage**, puis notification.
 *
 * Les mails partent après la réponse (`after`) : le visiteur n'attend pas
 * Resend, et un échec d'envoi ne lui est jamais montré — son message est
 * déjà en base, il n'a rien à refaire.
 */
export const submitContact = formAction(
  contactSchema,
  async (input) => {
    // Le piège à robots est vérifié par le schéma ; on distingue quand même
    // le cas ici pour renvoyer un code exploitable côté UI plutôt qu'une
    // erreur de validation affichée sous un champ invisible.
    if (input.website) {
      throw new ActionError("BOT_DETECTED", "Requête refusée.");
    }

    const stored = await storeContactMessage(db, input, { ipHash: await currentIpHash() });
    after(() => notifyContactMessage(stored));

    return { received: true, replyDelay: CONTACT_REPLY_DELAY };
  },
  {
    name: "contact.submit",
    rateLimit: RATE_LIMITS.contact,
    botProtection: true,
  },
);
