import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "../db";
import type { CompanyAddress, CompanyInfo } from "@/lib/company";
import type { CompanySettingsInput } from "@/lib/validation/company";

/**
 * Réglages entreprise (HEP-80) : un seul enregistrement, `id = "singleton"`.
 *
 * Service pur : lecture et écriture. Le cache des pages publiques est dans
 * `src/server/company.ts`.
 */

const ID = "singleton";

/**
 * Valeurs de départ si l'enregistrement n'existe pas encore (base neuve, seed
 * pas lancé). Rien d'inventé : seulement ce que le site affichait déjà.
 */
export const DEFAULT_COMPANY: CompanyInfo = {
  legalName: "Héphaïstos Paris",
  legalForm: null,
  shareCapitalCents: null,
  address: { line1: "", line2: null, postalCode: "", city: "Paris", country: "FR" },
  siret: null,
  vatNumber: null,
  rcs: null,
  publicationDirector: null,
  contactEmail: "contact@hephaistosparis.com",
  contactPhone: null,
  vatRate: 2000,
  shipsTo: ["FR"],
  currency: "EUR",
  hostName: "Vercel Inc.",
  hostAddress: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
};

/** Le JSON en base vient de nous, mais une vieille ligne peut manquer d'un champ. */
function toAddress(raw: Prisma.JsonValue): CompanyAddress {
  const a = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    line1: str(a.line1),
    line2: str(a.line2) || null,
    postalCode: str(a.postalCode),
    city: str(a.city),
    country: str(a.country) || "FR",
  };
}

export async function readCompanySettings(db: Tx): Promise<CompanyInfo> {
  const row = await db.companySettings.findUnique({ where: { id: ID } });
  if (!row) return DEFAULT_COMPANY;
  return {
    legalName: row.legalName,
    legalForm: row.legalForm,
    shareCapitalCents: row.shareCapitalCents,
    address: toAddress(row.address),
    siret: row.siret,
    vatNumber: row.vatNumber,
    rcs: row.rcs,
    publicationDirector: row.publicationDirector,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    vatRate: row.vatRate,
    shipsTo: row.shipsTo,
    currency: row.currency,
    hostName: row.hostName,
    hostAddress: row.hostAddress,
  };
}

/** Taux de TVA en vigueur, en points de base — celui que le panier et la commande appliquent. */
export async function currentVatRate(db: Tx): Promise<number> {
  const row = await db.companySettings.findUnique({ where: { id: ID }, select: { vatRate: true } });
  return row?.vatRate ?? DEFAULT_COMPANY.vatRate;
}

/**
 * Enregistre les réglages et inscrit au journal **ce qui a changé** — avant
 * et après. Une mention légale modifiée doit pouvoir être datée : c'est la
 * première question en cas de contrôle.
 */
export async function saveCompanySettings(
  tx: Tx,
  input: CompanySettingsInput,
  actorId: string,
): Promise<{ changed: string[] }> {
  const before = await readCompanySettings(tx);
  const data = { ...input, address: input.address as Prisma.InputJsonObject };

  await tx.companySettings.upsert({
    where: { id: ID },
    update: data,
    create: { id: ID, ...data },
  });

  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(input) as (keyof CompanySettingsInput)[]) {
    const from = before[key];
    const to = input[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) changed[key] = { from, to };
  }

  if (Object.keys(changed).length > 0) {
    await tx.auditLog.create({
      data: {
        actorId,
        entity: "CompanySettings",
        entityId: ID,
        action: "update",
        diff: changed as Prisma.InputJsonObject,
      },
    });
  }
  return { changed: Object.keys(changed) };
}
