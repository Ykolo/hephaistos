"use server";

import { revalidatePath } from "next/cache";
import { discountFormSchema, discountToggleSchema } from "@/lib/validation/discount";
import { action, formAction } from "../action";
import { db } from "../db";
import { requireAdminAction } from "../admin-guard";
import { saveDiscount, setDiscountActive } from "../services/discounts";

/**
 * Codes promo depuis l'administration (HEP-75).
 *
 * Chaque action commence par `requireAdminAction()` : une Server Action est un
 * point d'entrée réseau appelable directement, la garde de la page ne la
 * protège pas. L'écriture et sa ligne de journal partent dans la même
 * transaction : une modification sans trace est ce que HEP-78 interdit.
 */

const PAGE = "/admin/codes-promo";

export const saveDiscountCode = formAction(
  discountFormSchema,
  async (input) => {
    const { actorId } = await requireAdminAction();
    const result = await db.$transaction((tx) => saveDiscount(tx, input, actorId));
    revalidatePath(PAGE);
    return { ...result, code: input.code };
  },
  { name: "admin.discount.save", booleans: ["active"] },
);

export const toggleDiscountCode = action(
  discountToggleSchema,
  async ({ id, active }) => {
    const { actorId } = await requireAdminAction();
    await db.$transaction((tx) => setDiscountActive(tx, id, active, actorId));
    revalidatePath(PAGE);
    return { id, active };
  },
  { name: "admin.discount.toggle" },
);
