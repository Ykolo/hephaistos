import { z } from "zod";
import { digitsOnly, frenchVatKey, isValidFrenchVat, isValidSiret } from "../company";

/**
 * Formulaire des réglages entreprise (HEP-80).
 *
 * Tout arrive en texte. Un champ vide signifie « pas encore fourni » et
 * devient `null` — jamais une chaîne vide qui s'afficherait comme une valeur.
 */

const text = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ?? "").replace(/[\r\n\t]+/g, " ").trim())
    .refine((v) => v.length <= max, { error: `${max} caractères au maximum.` });

const optional = (max: number) => text(max).transform((v) => (v === "" ? null : v));

const required = (max: number, message: string) => text(max).refine((v) => v !== "", { error: message });

export const SHIPPABLE_COUNTRIES = ["FR", "BE", "LU", "MC", "CH", "DE", "ES", "IT"] as const;

export const companySettingsSchema = z
  .object({
    legalName: required(120, "La raison sociale est requise."),
    legalForm: optional(40),
    shareCapital: text(20),
    line1: text(120),
    line2: optional(120),
    postalCode: text(10),
    city: text(80),
    country: z.enum(["FR", "BE", "LU", "MC"], { error: "Pays inconnu." }).default("FR"),
    siret: text(20),
    vatNumber: text(20),
    rcs: optional(80),
    publicationDirector: optional(120),
    contactEmail: z
      .string({ error: "L'email de contact est requis." })
      .trim()
      .toLowerCase()
      .pipe(z.email({ error: "Cette adresse email n'est pas valide." })),
    contactPhone: optional(30),
    vatRate: text(6),
    shipsTo: z.array(z.enum(SHIPPABLE_COUNTRIES)).min(1, { error: "Au moins un pays de livraison." }),
    hostName: required(120, "L'hébergeur est une mention obligatoire."),
    hostAddress: required(200, "L'adresse de l'hébergeur est une mention obligatoire."),
  })
  .transform((input, ctx) => {
    const issue = (path: string, message: string) => {
      ctx.addIssue({ code: "custom", path: [path], message });
      return z.NEVER;
    };

    // Adresse : tout ou rien. Une rue sans ville ne sert à personne.
    const addressParts = [input.line1, input.postalCode, input.city];
    if (addressParts.some((p) => p !== "") && addressParts.some((p) => p === "")) {
      return issue(input.line1 === "" ? "line1" : input.postalCode === "" ? "postalCode" : "city", "Adresse incomplète.");
    }
    if (input.country === "FR" && input.postalCode !== "" && !/^\d{5}$/.test(input.postalCode)) {
      return issue("postalCode", "Code postal à 5 chiffres.");
    }

    let shareCapitalCents: number | null = null;
    if (input.shareCapital !== "") {
      const euros = Number(input.shareCapital.replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(euros) || euros <= 0) return issue("shareCapital", "Montant en euros.");
      shareCapitalCents = Math.round(euros * 100);
    }

    let siret: string | null = null;
    if (input.siret !== "") {
      siret = digitsOnly(input.siret);
      if (!/^\d{14}$/.test(siret)) return issue("siret", "Le SIRET compte 14 chiffres.");
      if (!isValidSiret(siret)) return issue("siret", "Ce SIRET n'est pas valide : vérifiez les chiffres.");
    }

    let vatNumber: string | null = null;
    if (input.vatNumber !== "") {
      vatNumber = input.vatNumber.replace(/\s/g, "").toUpperCase();
      if (!/^FR\d{11}$/.test(vatNumber)) {
        return issue("vatNumber", "Format attendu : FR, 2 chiffres de clé, puis le SIREN.");
      }
      if (!isValidFrenchVat(vatNumber)) return issue("vatNumber", "La clé de ce numéro de TVA est fausse.");
      if (siret && vatNumber.slice(4) !== siret.slice(0, 9)) {
        return issue(
          "vatNumber",
          `Ce numéro ne correspond pas au SIRET : attendu FR${frenchVatKey(siret.slice(0, 9))}${siret.slice(0, 9)}.`,
        );
      }
    }

    const pct = Number(input.vatRate.replace(",", "."));
    if (input.vatRate === "" || !Number.isFinite(pct) || pct < 0 || pct > 30) {
      return issue("vatRate", "Taux en pourcentage, entre 0 et 30.");
    }

    return {
      legalName: input.legalName,
      legalForm: input.legalForm,
      shareCapitalCents,
      address: {
        line1: input.line1,
        line2: input.line2,
        postalCode: input.postalCode,
        city: input.city,
        country: input.country,
      },
      siret,
      vatNumber,
      rcs: input.rcs,
      publicationDirector: input.publicationDirector,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      vatRate: Math.round(pct * 100),
      shipsTo: input.shipsTo,
      hostName: input.hostName,
      hostAddress: input.hostAddress,
    };
  });

export type CompanySettingsInput = z.output<typeof companySettingsSchema>;
