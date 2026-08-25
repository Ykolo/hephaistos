import { z } from "zod";
import { emailSchema, honeypotSchema, nameSchema } from "./common";

/**
 * Formulaire de contact — champs alignés sur le modèle `Message` et sur le
 * formulaire déjà à l'écran (`src/components/contact-form.tsx`).
 *
 * La persistance, la notification et l'anti-spam sont le sujet de HEP-89 ;
 * ici on ne pose que le contrat d'entrée.
 */
export const contactSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  subject: z
    .string({ error: "Le sujet est requis." })
    .trim()
    .min(3, { error: "Le sujet doit contenir au moins 3 caractères." })
    .max(150, { error: "Le sujet ne peut pas dépasser 150 caractères." }),
  body: z
    .string({ error: "Le message est requis." })
    .trim()
    .min(10, { error: "Votre message doit contenir au moins 10 caractères." })
    .max(5000, { error: "Votre message ne peut pas dépasser 5000 caractères." }),
  website: honeypotSchema, // piège à robots, jamais affiché
});

export type ContactInput = z.infer<typeof contactSchema>;

/** Inscription newsletter — double opt-in côté serveur (HEP-67). */
export const newsletterSchema = z.object({
  email: emailSchema,
  source: z.enum(["band", "hero", "produit", "checkout"]).optional(),
  website: honeypotSchema,
});

export type NewsletterInput = z.infer<typeof newsletterSchema>;
