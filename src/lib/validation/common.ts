import { z } from "zod";

/**
 * Primitives de validation partagées client / serveur (HEP-34).
 *
 * Les messages sont rédigés en français et destinés à être affichés tels
 * quels sous le champ concerné : ce sont eux que verra le client, pas une
 * traduction faite plus tard.
 */

/**
 * Chaîne requise, coupée de ses espaces.
 *
 * Le message est posé sur le **type** et pas seulement sur les contraintes :
 * sans lui, un champ absent produit le message par défaut de Zod — « Invalid
 * input: expected string, received undefined » — affiché tel quel au client.
 */
function requiredString(error = "Ce champ est requis.") {
  return z.string({ error }).trim();
}

/** Coupe les espaces avant toute vérification : « 	 » n'est pas un prénom. */
const trimmed = requiredString();

export const nameSchema = trimmed
  .min(2, { error: "Ce champ doit contenir au moins 2 caractères." })
  .max(80, { error: "Ce champ ne peut pas dépasser 80 caractères." });

export const emailSchema = requiredString("L'adresse email est requise.")
  .toLowerCase()
  .pipe(z.email({ error: "Cette adresse email n'est pas valide." }))
  .refine((v) => v.length <= 254, {
    error: "Cette adresse email est trop longue.",
  });

/** 5 chiffres. Les DOM-TOM (97xxx, 98xxx) passent, la Corse aussi. */
export const postalCodeSchema = trimmed.regex(/^\d{5}$/, {
  error: "Le code postal doit contenir 5 chiffres.",
});

/**
 * Téléphone français, tolérant à la saisie : espaces, points, tirets et
 * indicatif +33 sont acceptés puis normalisés. Refuser un numéro pour un
 * espace de trop est le meilleur moyen de perdre une commande.
 */
export const phoneSchema = trimmed
  .transform((v) => v.replace(/[\s.\-()]/g, ""))
  .pipe(
    z.string().regex(/^(?:\+33|0)[1-9]\d{8}$/, {
      error: "Ce numéro de téléphone n'est pas valide.",
    }),
  );

export const quantitySchema = z
  .number({ error: "La quantité doit être un nombre." })
  .int({ error: "La quantité doit être un nombre entier." })
  .min(1, { error: "La quantité doit être d'au moins 1." })
  .max(99, { error: "La quantité maximale est de 99 par article." });

/** Identifiant technique venant du client : jamais un montant, jamais un prix. */
export const idSchema = z.uuid({ error: "Identifiant invalide." });

export const slugSchema = trimmed
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: "Identifiant de produit invalide." });

/**
 * Champ piège : invisible à l'écran, donc toujours vide pour un humain.
 * Un robot qui remplit tout le formulaire le remplit aussi et se trahit.
 * Complète Vercel BotID (HEP-35) sans le remplacer.
 *
 * Le schéma accepte volontairement n'importe quelle valeur : c'est l'action
 * qui tranche, en renvoyant `BOT_DETECTED`. Refuser ici produirait une erreur
 * de validation rattachée à un champ que personne ne voit — le formulaire
 * afficherait « champs invalides » sans rien surligner, et un vrai client
 * victime d'un faux positif n'aurait aucun moyen de comprendre.
 */
export const honeypotSchema = z.string().optional();

export const consentSchema = z
  .boolean()
  .refine((v) => v === true, { error: "Votre accord est nécessaire pour continuer." });
