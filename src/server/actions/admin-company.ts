"use server";

import { revalidatePath } from "next/cache";
import { companySettingsSchema } from "@/lib/validation/company";
import { formAction } from "../action";
import { db } from "../db";
import { requireAdminAction } from "../admin-guard";
import { saveCompanySettings } from "../services/company";
import { invalidateCompany } from "../company";

/**
 * Réglages entreprise (HEP-80). Garde admin, écriture et journal dans la même
 * transaction, puis invalidation du cache : pied de page et mentions légales
 * changent à la requête suivante.
 */
export const saveCompanySettingsAction = formAction(
  companySettingsSchema,
  async (input) => {
    const { actorId } = await requireAdminAction();
    const result = await db.$transaction((tx) => saveCompanySettings(tx, input, actorId));
    invalidateCompany();
    revalidatePath("/admin/reglages");
    return result;
  },
  { name: "admin.company.save", arrays: ["shipsTo"] },
);
