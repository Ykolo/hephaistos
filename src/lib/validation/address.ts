import { z } from "zod";
import { nameSchema, phoneSchema, postalCodeSchema } from "./common";

/**
 * Adresse de livraison et de facturation (HEP-52).
 *
 * Validée ici, **copiée** dans `Order.shippingAddress` / `Order.billingAddress`
 * en JSON. Jamais référencée : le client qui corrige son adresse dans son
 * espace après expédition ne doit pas réécrire rétroactivement l'adresse d'une
 * commande déjà livrée, sinon le litige devient insoluble.
 */

const line = z
  .string({ error: "Ce champ est requis." })
  .trim()
  .min(1, { error: "Ce champ est requis." })
  .max(120, { error: "Ce champ ne peut pas dépasser 120 caractères." });

export const addressSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  /** Raison sociale, pour une livraison en entreprise. */
  company: line.max(120).optional(),
  line1: line,
  /** Appartement, bâtiment, digicode — ce qui fait qu'un colis arrive. */
  line2: line.optional(),
  postalCode: postalCodeSchema,
  city: line.max(80, { error: "Ce champ ne peut pas dépasser 80 caractères." }),
  /**
   * ISO 3166-1 alpha-2. La France seule pour l'instant : ouvrir un pays
   * demande une grille de port (lot 7) et un taux de TVA à revoir, ce n'est
   * pas qu'une ligne de plus dans une liste déroulante.
   */
  country: z.literal("FR", {
    error: "Nous ne livrons pour l'instant qu'en France métropolitaine.",
  }),
  /** Exigé par les transporteurs pour la livraison en point relais. */
  phone: phoneSchema,
});

export type Address = z.infer<typeof addressSchema>;
