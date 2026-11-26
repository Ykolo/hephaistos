"use server";

import { revalidatePath } from "next/cache";
import { shippingRateDeleteSchema, shippingRateFormSchema } from "@/lib/validation/shipping";
import { action, formAction } from "../action";
import { db } from "../db";
import { requireAdminAction } from "../admin-guard";
import { deleteShippingRate, saveShippingRate } from "../services/shipping";

/**
 * Grille de frais de port depuis l'administration (HEP-70).
 *
 * Mêmes garanties que les codes promo : garde admin en tête de chaque action,
 * écriture et ligne de journal dans la même transaction.
 */

const PAGE = "/admin/livraison";

function revalidate() {
  revalidatePath(PAGE);
  // Le tiroir du panier vit dans le chrome : un tarif modifié doit s'y voir.
  revalidatePath("/", "layout");
}

export const saveShippingRateAction = formAction(
  shippingRateFormSchema,
  async (input) => {
    const { actorId } = await requireAdminAction();
    const result = await db.$transaction((tx) => saveShippingRate(tx, input, actorId));
    revalidate();
    return result;
  },
  { name: "admin.shipping.save", booleans: ["active"] },
);

export const deleteShippingRateAction = action(
  shippingRateDeleteSchema,
  async ({ id }) => {
    const { actorId } = await requireAdminAction();
    await db.$transaction((tx) => deleteShippingRate(tx, id, actorId));
    revalidate();
    return { id };
  },
  { name: "admin.shipping.delete" },
);
