import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  findPublishedProductBySlug,
  listPublishedProducts,
  upsertProduct,
} from "@/server/services/catalog";
import { productFormSchema } from "@/lib/validation/product";
import { formatPricePer100ml } from "@/lib/format";
import { cleanupTestProducts, testDb } from "./helpers/db";

beforeEach(cleanupTestProducts);
afterAll(async () => {
  await cleanupTestProducts();
  await testDb.$disconnect();
});

/** Formulaire valide minimal, surchargeable champ par champ. */
function form(overrides: Record<string, string> = {}) {
  return {
    slug: "test-produit",
    sku: "TEST-SKU-001",
    name: "Produit de test",
    description: "Une description suffisamment longue pour passer la validation.",
    category: "TREATMENT",
    status: "PUBLISHED",
    availability: "IN_STOCK",
    priceCents: "20",
    volumeMl: "30",
    weightGrams: "80",
    ...overrides,
  };
}

describe("validation de la fiche produit", () => {
  it("accepte la virgule décimale et convertit en centimes", () => {
    const r = productFormSchema.safeParse(form({ priceCents: "19,90" }));
    expect(r.success).toBe(true);
    expect(r.data?.priceCents).toBe(1990);
  });

  it("accepte aussi le point décimal", () => {
    const r = productFormSchema.safeParse(form({ priceCents: "19.90" }));
    expect(r.data?.priceCents).toBe(1990);
  });

  it("refuse un prix vide plutôt que de le convertir en zéro", () => {
    // Number("") vaut 0 : sans garde, un champ vide créerait un produit
    // gratuit sans que personne ne s'en aperçoive.
    const r = productFormSchema.safeParse(form({ priceCents: "" }));
    expect(r.success).toBe(false);
  });

  it("refuse un poids absent — le tarif d'expédition en dépend", () => {
    const r = productFormSchema.safeParse(form({ weightGrams: "" }));
    expect(r.success).toBe(false);
  });

  it("refuse une contenance nulle — le prix au litre serait une division par zéro", () => {
    const r = productFormSchema.safeParse(form({ volumeMl: "0" }));
    expect(r.success).toBe(false);
  });

  it("refuse un prix barré inférieur au prix de vente", () => {
    const r = productFormSchema.safeParse(
      form({ priceCents: "20", compareAtCents: "15" }),
    );
    expect(r.success).toBe(false);
    const issue = r.error?.issues.find((i) => i.path[0] === "compareAtCents");
    expect(issue?.message).toContain("supérieur");
  });

  it("rend ses messages en français", () => {
    const r = productFormSchema.safeParse(form({ priceCents: "abcd" }));
    expect(r.error?.issues[0].message).toBe("Le prix doit être un nombre.");
  });
});

describe("prix à l'unité de mesure", () => {
  /** `Intl` sépare le montant du symbole par une espace insécable (U+00A0). */
  const nbsp = (s: string) => s.replace(/ /g, " ");

  it("est juste sur les trois références du catalogue", () => {
    // 15 € / 150 ml, 20 € / 30 ml, 20 € / 50 ml
    expect(formatPricePer100ml(1500, 150)).toBe(nbsp("10,00 €") + " / 100 ml");
    expect(formatPricePer100ml(2000, 30)).toBe(nbsp("66,67 €") + " / 100 ml");
    expect(formatPricePer100ml(2000, 50)).toBe(nbsp("40,00 €") + " / 100 ml");
  });

  it("sépare le montant du symbole par une espace insécable", () => {
    // Typographie française : « 10,00 € » ne doit jamais se couper en fin de
    // ligne. C'est `Intl` qui l'assure — ce test empêche de le remplacer un
    // jour par une concaténation naïve.
    expect(formatPricePer100ml(1500, 150)).toContain(" €");
  });

  it("renvoie null sans contenance, plutôt qu'un prix faux", () => {
    expect(formatPricePer100ml(2000, null)).toBeNull();
    expect(formatPricePer100ml(2000, 0)).toBeNull();
  });
});

describe("écriture du catalogue", () => {
  const data = {
    slug: "test-ecriture",
    sku: "TEST-ECR-001",
    name: "Produit écrit",
    description: "Description de test.",
    tagline: null,
    category: "TREATMENT" as const,
    status: "PUBLISHED" as const,
    availability: "IN_STOCK" as const,
    priceCents: 2000,
    compareAtCents: null,
    volumeMl: 30,
    weightGrams: 80,
    usage: null,
    inci: null,
    precautions: null,
    seoTitle: null,
    seoDescription: null,
  };

  it("journalise le diff, pas l'état final", async () => {
    await upsertProduct(testDb, data, "admin-test");
    await upsertProduct(testDb, { ...data, priceCents: 2450 }, "admin-test");

    const log = await testDb.auditLog.findFirstOrThrow({
      where: { entity: "Product", action: "update" },
      orderBy: { createdAt: "desc" },
    });

    // Savoir qu'un prix vaut 24,50 € n'aide pas ; savoir qu'il est passé de
    // 20 à 24,50 si — c'est ce qu'on cherche quand un client conteste.
    expect(log.diff).toMatchObject({
      priceCents: { avant: 2000, apres: 2450 },
    });
    expect(log.actorId).toBe("admin-test");
  });

  it("n'écrit pas au journal quand rien ne change", async () => {
    await upsertProduct(testDb, data, "admin-test");
    await upsertProduct(testDb, data, "admin-test");

    // Compteur restreint à l'acteur du test : le journal d'audit n'a
    // volontairement pas de clé étrangère vers Product et conserve donc les
    // entrées laissées par d'autres usages de la base locale.
    const updates = await testDb.auditLog.count({
      where: { entity: "Product", action: "update", actorId: "admin-test" },
    });
    expect(updates).toBe(0);
  });

  it("un brouillon disparaît du catalogue public", async () => {
    await upsertProduct(testDb, data, "admin-test");
    expect(await findPublishedProductBySlug(testDb, data.slug)).not.toBeNull();

    await upsertProduct(testDb, { ...data, status: "DRAFT" }, "admin-test");

    expect(await findPublishedProductBySlug(testDb, data.slug)).toBeNull();
    const published = await listPublishedProducts(testDb);
    expect(published.map((p) => p.slug)).not.toContain(data.slug);
  });

  it("un produit archivé disparaît aussi", async () => {
    await upsertProduct(testDb, { ...data, status: "ARCHIVED" }, "admin-test");
    expect(await findPublishedProductBySlug(testDb, data.slug)).toBeNull();
  });
});
