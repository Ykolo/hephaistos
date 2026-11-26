import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cgvSummary,
  footerLine,
  formatAddress,
  formatCapital,
  isValidFrenchVat,
  isValidSiret,
  legalMentions,
  missingLegalFields,
  TO_COMPLETE,
} from "@/lib/company";
import { companySettingsSchema } from "@/lib/validation/company";
import {
  currentVatRate,
  DEFAULT_COMPANY,
  readCompanySettings,
  saveCompanySettings,
} from "@/server/services/company";
import { testDb } from "./helpers/db";

/** Réglages entreprise (HEP-80). */

const ACTOR = "admin-test-company";

// La ligne est unique et partagée avec la branche de dev : sauvegardée avant,
// restaurée après, comme la grille de port.
let saved: Awaited<ReturnType<typeof testDb.companySettings.findUnique>> = null;
beforeAll(async () => {
  saved = await testDb.companySettings.findUnique({ where: { id: "singleton" } });
});
afterAll(async () => {
  await testDb.companySettings.deleteMany({ where: { id: "singleton" } });
  if (saved) {
    const { address, ...rest } = saved;
    await testDb.companySettings.create({ data: { ...rest, address: address ?? {} } });
  }
  await testDb.auditLog.deleteMany({ where: { actorId: ACTOR } });
  await testDb.$disconnect();
});

const form = {
  legalName: "Héphaïstos Paris",
  legalForm: "SAS",
  shareCapital: "1 000",
  line1: "12 rue de la Forge",
  line2: "",
  postalCode: "75011",
  city: "Paris",
  country: "FR",
  siret: "732 829 320 00074",
  vatNumber: "FR 44 732829320",
  rcs: "RCS Paris 732 829 320",
  publicationDirector: "Jules Martin",
  contactEmail: "Contact@HephaistosParis.com",
  contactPhone: "",
  vatRate: "20",
  shipsTo: ["FR"],
  hostName: "Vercel Inc.",
  hostAddress: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
};

describe("contrôles de saisie", () => {
  it("SIRET : 14 chiffres et clé de Luhn, avec l'exception de La Poste", () => {
    expect(isValidSiret("73282932000074")).toBe(true);
    expect(isValidSiret("73282932000075")).toBe(false); // un chiffre de travers
    expect(isValidSiret("7328293200007")).toBe(false); // 13 chiffres
    expect(isValidSiret("35600000049837")).toBe(true); // La Poste : somme multiple de 5
  });

  it("TVA : FR + clé + SIREN, clé vérifiée", () => {
    expect(isValidFrenchVat("FR44732829320")).toBe(true);
    expect(isValidFrenchVat("FR45732829320")).toBe(false);
    expect(isValidFrenchVat("FR732829320")).toBe(false);
  });

  it("convertit la saisie : espaces retirés, euros en centimes, pourcentage en points de base", () => {
    const parsed = companySettingsSchema.parse(form);
    expect(parsed).toMatchObject({
      siret: "73282932000074",
      vatNumber: "FR44732829320",
      shareCapitalCents: 100_000,
      vatRate: 2000,
      contactEmail: "contact@hephaistosparis.com",
      contactPhone: null,
      address: { line1: "12 rue de la Forge", line2: null, postalCode: "75011", city: "Paris", country: "FR" },
    });
  });

  it("refuse un SIRET faux, une TVA qui ne correspond pas au SIRET, une adresse incomplète", () => {
    const issue = (overrides: Partial<typeof form>) => {
      const r = companySettingsSchema.safeParse({ ...form, ...overrides });
      return r.success ? null : { path: r.error.issues[0].path[0], message: r.error.issues[0].message };
    };
    expect(issue({ siret: "73282932000075" })).toEqual({
      path: "siret",
      message: "Ce SIRET n'est pas valide : vérifiez les chiffres.",
    });
    // TVA juste en soi, mais d'une autre société que le SIRET.
    expect(issue({ siret: "44306184100047" })?.message).toBe(
      "Ce numéro ne correspond pas au SIRET : attendu FR64443061841.",
    );
    expect(issue({ postalCode: "" })?.path).toBe("postalCode");
    expect(issue({ shipsTo: [] })?.path).toBe("shipsTo");
    expect(issue({ hostName: "" })?.path).toBe("hostName");
  });

  it("un champ vide devient « non fourni », pas une chaîne vide", () => {
    const parsed = companySettingsSchema.parse({ ...form, siret: "", vatNumber: "", rcs: " ", shareCapital: "" });
    expect(parsed).toMatchObject({ siret: null, vatNumber: null, rcs: null, shareCapitalCents: null });
  });
});

describe("mentions légales", () => {
  it("affiche « à compléter » plutôt qu'une valeur inventée", () => {
    const rows = legalMentions(DEFAULT_COMPANY);
    expect(rows.find((r) => r.label === "SIRET")).toEqual({ label: "SIRET", value: TO_COMPLETE, missing: true });
    expect(missingLegalFields(DEFAULT_COMPANY)).toEqual([
      "Capital social",
      "Siège social",
      "SIRET",
      "RCS",
      "TVA intracommunautaire",
      "Directeur de la publication",
    ]);
  });

  it("complètes une fois les réglages saisis, hébergeur réel compris", () => {
    const info = { ...DEFAULT_COMPANY, ...companySettingsSchema.parse(form) };
    expect(missingLegalFields(info)).toEqual([]);
    const rows = Object.fromEntries(legalMentions(info).map((r) => [r.label, r.value]));
    expect(rows).toMatchObject({
      Éditeur: "Héphaïstos Paris, SAS",
      SIRET: "732 829 320 00074",
      "Siège social": "12 rue de la Forge, 75011 Paris, France",
      Hébergeur: "Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
    });
    expect(formatCapital(100_000).replace(/\s/g, " ")).toBe("1 000 €");
  });

  it("plus aucune mention de Shopify ; les CGV citent la société et les pays livrés", () => {
    const info = { ...DEFAULT_COMPANY, ...companySettingsSchema.parse({ ...form, shipsTo: ["FR", "BE"] }) };
    const cgv = cgvSummary(info);
    expect(cgv).not.toMatch(/shopify/i);
    expect(cgv).toContain("12 rue de la Forge, 75011 Paris, France");
    expect(cgv).toContain("Livraison en France et Belgique");
    expect(cgv).toContain("TVA 20 % incluse");
    for (const r of legalMentions(info)) expect(r.value).not.toMatch(/shopify/i);
  });

  it("le pied de page suit l'adresse", () => {
    const info = { ...DEFAULT_COMPANY, address: { ...DEFAULT_COMPANY.address, city: "Lyon" } };
    expect(footerLine(info)).toBe("Héphaïstos Paris · Lyon, France");
    expect(formatAddress(DEFAULT_COMPANY.address)).toBeNull();
  });
});

describe("enregistrement", () => {
  it("écrit la ligne unique, journalise avant / après, et ne journalise rien sans changement", async () => {
    await testDb.companySettings.deleteMany({ where: { id: "singleton" } });
    expect(await readCompanySettings(testDb)).toEqual(DEFAULT_COMPANY);

    const input = companySettingsSchema.parse(form);
    const first = await testDb.$transaction((tx) => saveCompanySettings(tx, input, ACTOR));
    expect(first.changed).toContain("siret");

    const stored = await readCompanySettings(testDb);
    expect(stored).toMatchObject({ siret: "73282932000074", address: { city: "Paris" } });

    const moved = companySettingsSchema.parse({ ...form, line1: "3 quai de Saône", postalCode: "69001", city: "Lyon" });
    const second = await testDb.$transaction((tx) => saveCompanySettings(tx, moved, ACTOR));
    expect(second.changed).toEqual(["address"]);

    const again = await testDb.$transaction((tx) => saveCompanySettings(tx, moved, ACTOR));
    expect(again.changed).toEqual([]);

    const logs = await testDb.auditLog.findMany({
      where: { actorId: ACTOR, entity: "CompanySettings" },
      orderBy: { createdAt: "asc" },
    });
    expect(logs).toHaveLength(2);
    expect(logs[1].diff).toMatchObject({
      address: { from: { city: "Paris" }, to: { city: "Lyon", postalCode: "69001" } },
    });
  });

  it("le taux de TVA des réglages est celui du panier et des commandes", async () => {
    const input = companySettingsSchema.parse({ ...form, vatRate: "5,5" });
    await testDb.$transaction((tx) => saveCompanySettings(tx, input, ACTOR));
    expect(await currentVatRate(testDb)).toBe(550);

    await testDb.$transaction((tx) => saveCompanySettings(tx, companySettingsSchema.parse(form), ACTOR));
    expect(await currentVatRate(testDb)).toBe(2000);
  });
});
