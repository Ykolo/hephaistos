import { z } from "zod";

/**
 * Saisie d'une fiche produit en administration (HEP-39).
 *
 * Décision actée dans HEP-23 : **pas de variantes**. Un produit = une
 * contenance = un SKU. Le coffret est un produit à part entière (HEP-40).
 */

const requiredText = (label: string, min = 1, max = 5000) =>
  z
    .string({ error: `${label} est requis.` })
    .trim()
    .min(min, {
      error:
        min === 1
          ? `${label} est requis.`
          : `${label} doit contenir au moins ${min} caractères.`,
    })
    .max(max, { error: `${label} ne peut pas dépasser ${max} caractères.` });

const optionalText = (max = 5000) =>
  z
    .string()
    .trim()
    .max(max, { error: `Ce champ ne peut pas dépasser ${max} caractères.` })
    .optional()
    .transform((v) => (v ? v : null));

/**
 * Montant saisi en **euros** par l'administrateur, stocké en **centimes**.
 *
 * La conversion se fait ici, une fois, à la frontière : accepter « 19,90 » ou
 * « 19.90 » puis arrondir au centime évite qu'un flottant se promène dans le
 * reste de l'application.
 */
/**
 * Analyse un montant saisi à la main : « 19,90 » comme « 19.90 ».
 *
 * Refuser une virgule décimale sur un formulaire français serait absurde,
 * et un `Number()` nu accepterait `""` en le convertissant en 0 — donc un
 * produit à zéro euro sans que personne ne s'en aperçoive.
 */
function parseEuros(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".").replace(/\s/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const euroToCents = z
  .string({ error: "Le prix est requis." })
  .transform((raw, ctx) => {
    const euros = parseEuros(raw);
    if (euros === null) {
      ctx.addIssue({ code: "custom", message: "Le prix doit être un nombre." });
      return z.NEVER;
    }
    if (euros <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Le prix doit être supérieur à zéro.",
      });
      return z.NEVER;
    }
    if (euros > 100_000) {
      ctx.addIssue({ code: "custom", message: "Ce prix semble erroné." });
      return z.NEVER;
    }
    return Math.round(euros * 100);
  });

const optionalEuroToCents = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (raw === undefined || raw.trim() === "") return null;
    const euros = parseEuros(raw);
    if (euros === null || euros <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Le prix barré doit être un nombre supérieur à zéro.",
      });
      return z.NEVER;
    }
    return Math.round(euros * 100);
  });

const positiveInt = (label: string) =>
  z.string({ error: `${label} est requis.` }).transform((raw, ctx) => {
    const cleaned = raw.trim().replace(/\s/g, "");
    if (cleaned === "") {
      ctx.addIssue({ code: "custom", message: `${label} est requis.` });
      return z.NEVER;
    }
    const n = Number(cleaned);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: `${label} doit être un nombre.` });
      return z.NEVER;
    }
    if (!Number.isInteger(n)) {
      ctx.addIssue({
        code: "custom",
        message: `${label} doit être un nombre entier.`,
      });
      return z.NEVER;
    }
    if (n <= 0) {
      ctx.addIssue({
        code: "custom",
        message: `${label} doit être supérieur à zéro.`,
      });
      return z.NEVER;
    }
    return n;
  });

export const productFormSchema = z
  .object({
    /** Absent à la création, présent à la modification. */
    id: z.string().optional(),

    slug: z
      .string({ error: "L'identifiant d'URL est requis." })
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        error:
          "L'identifiant d'URL ne peut contenir que des lettres minuscules, des chiffres et des tirets.",
      }),

    sku: requiredText("La référence SKU", 3, 40),
    name: requiredText("Le nom", 2, 120),
    description: requiredText("La description", 20, 5000),
    tagline: optionalText(160),

    category: z.enum(["CLEANSING", "TREATMENT", "HYDRATION"], {
      error: "La catégorie est requise.",
    }),

    /**
     * `BUNDLE` = coffret. Son stock n'est jamais saisi : il se calcule sur les
     * composants, dont la composition s'édite dans un second temps (HEP-40).
     */
    kind: z.enum(["SIMPLE", "BUNDLE"], { error: "Le type est requis." }),

    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"], {
      error: "Le statut est requis.",
    }),
    availability: z.enum(
      ["COMING_SOON", "IN_STOCK", "PREORDER", "OUT_OF_STOCK", "DISCONTINUED"],
      { error: "La disponibilité est requise." },
    ),

    priceCents: euroToCents,
    compareAtCents: optionalEuroToCents,

    /**
     * Obligatoire : c'est ce qui permet de calculer le prix à l'unité de
     * mesure, dont l'affichage est imposé par le code de la consommation
     * pour les produits vendus au volume.
     */
    volumeMl: positiveInt("La contenance"),

    /**
     * Obligatoire dès la saisie : toute la grille tarifaire Sendcloud en
     * dépend (lot 7). Un produit sans poids ne peut pas être expédié.
     */
    weightGrams: positiveInt("Le poids"),

    usage: optionalText(2000),
    inci: optionalText(4000),
    precautions: optionalText(2000),
    seoTitle: optionalText(70),
    seoDescription: optionalText(160),
  })
  .refine(
    (v) => v.compareAtCents === null || v.compareAtCents > v.priceCents,
    {
      error: "Le prix barré doit être supérieur au prix de vente.",
      path: ["compareAtCents"],
    },
  );

export type ProductFormInput = z.infer<typeof productFormSchema>;

/**
 * Composition d'un coffret (HEP-40).
 *
 * Le stock du coffret n'est **jamais** saisi : il se déduit des composants.
 * Seule la liste « quel produit, en quelle quantité » est éditable.
 */
export const bundleCompositionSchema = z.object({
  bundleSlug: z.string().min(1),
  components: z
    .array(
      z.object({
        slug: z.string().min(1, { error: "Composant invalide." }),
        qty: z
          .number({ error: "La quantité doit être un nombre." })
          .int({ error: "La quantité doit être un nombre entier." })
          .min(1, { error: "La quantité doit être d'au moins 1." })
          .max(50, { error: "La quantité maximale est de 50." }),
      }),
    )
    .min(1, { error: "Un coffret doit contenir au moins un produit." })
    .refine(
      (list) => new Set(list.map((c) => c.slug)).size === list.length,
      { error: "Un même produit ne peut pas figurer deux fois dans un coffret." },
    ),
});

export type BundleCompositionInput = z.infer<typeof bundleCompositionSchema>;

/** Réordonnancement : liste de slugs dans l'ordre d'affichage voulu. */
export const reorderSchema = z.object({
  slugs: z
    .array(z.string().min(1))
    .min(1, { error: "Aucun produit à réordonner." }),
});
