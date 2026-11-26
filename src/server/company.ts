import { cacheLife, cacheTag, updateTag } from "next/cache";
import { db } from "./db";
import { readCompanySettings } from "./services/company";
import type { CompanyInfo } from "@/lib/company";

/**
 * Cache des réglages entreprise pour les pages publiques (HEP-80) : pied de
 * page sur toutes les pages, mentions légales, CGV.
 *
 * Même principe que le catalogue (`catalog.ts`) : une écriture dans l'admin
 * appelle `invalidateCompany()`, et l'adresse modifiée apparaît à la requête
 * suivante — c'est la definition of done.
 */

export const companyTag = "company-settings";

export async function getCompanySettings(): Promise<CompanyInfo> {
  "use cache";
  cacheTag(companyTag);
  cacheLife("days");
  return readCompanySettings(db);
}

export function invalidateCompany(): void {
  updateTag(companyTag);
}
