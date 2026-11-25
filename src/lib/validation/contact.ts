import { z } from "zod";
import { emailSchema, honeypotSchema, nameSchema } from "./common";

/**
 * Au-delà, c'est presque toujours du spam (HEP-89). Un client qui joint un
 * lien vers sa commande ou une photo n'en met pas quatre.
 */
export const CONTACT_MAX_LINKS = 3;

/** Liens comptés comme le ferait un lecteur : adresses web, avec ou sans schéma. */
export function countLinks(text: string): number {
  return text.match(/\bhttps?:\/\/|\bwww\./gi)?.length ?? 0;
}

/**
 * Une ligne, pas deux : le sujet et le nom finissent dans l'en-tête d'un mail.
 * Un retour à la ligne glissé dans une requête forgée y injecterait des
 * en-têtes.
 */
const oneLine = (v: string) => v.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ");

/**
 * Formulaire de contact — champs alignés sur le modèle `Message` et sur le
 * formulaire déjà à l'écran (`src/components/contact-form.tsx`).
 *
 * La persistance, la notification et l'anti-spam sont le sujet de HEP-89 ;
 * ici on ne pose que le contrat d'entrée.
 */
export const contactSchema = z.object({
  firstName: nameSchema.transform(oneLine),
  lastName: nameSchema.transform(oneLine),
  email: emailSchema,
  subject: z
    .string({ error: "Le sujet est requis." })
    .trim()
    .min(3, { error: "Le sujet doit contenir au moins 3 caractères." })
    .max(150, { error: "Le sujet ne peut pas dépasser 150 caractères." })
    .transform(oneLine),
  body: z
    .string({ error: "Le message est requis." })
    .trim()
    .min(10, { error: "Votre message doit contenir au moins 10 caractères." })
    .max(5000, { error: "Votre message ne peut pas dépasser 5000 caractères." })
    .refine((v) => countLinks(v) <= CONTACT_MAX_LINKS, {
      error: `Votre message contient trop de liens (${CONTACT_MAX_LINKS} au maximum).`,
    }),
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
