"use server";

import { contactSchema } from "@/lib/validation/contact";
import { ActionError } from "../errors";
import { formAction } from "../action";

/**
 * Envoi du formulaire de contact.
 *
 * Périmètre HEP-34 : démontrer le socle de bout en bout — validation Zod,
 * messages français, erreurs rendues au bon champ, contrat de retour unique.
 *
 * ⚠️ Le message n'est **pas encore persisté**. Le stockage dans `Message`, la
 * notification par Resend et l'anti-spam Vercel BotID sont le contenu de
 * HEP-89 ; tant qu'il n'est pas fait, ce formulaire valide correctement mais
 * n'achemine rien. Il ne doit pas partir en production dans cet état.
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

    // TODO(HEP-89) : db.message.create(...) puis notification Resend.
    return { received: true, email: input.email };
  },
  {
    name: "contact.submit",
    rateLimit: { limit: 3, windowSeconds: 600, by: "ip" },
  },
);
