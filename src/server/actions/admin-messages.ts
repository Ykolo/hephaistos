"use server";

import { revalidatePath } from "next/cache";
import { messageStatusSchema } from "@/lib/validation/admin-message";
import { action } from "../action";
import { db } from "../db";
import { requireAdminAction } from "../admin-guard";
import { setMessageStatus } from "../services/messages";

/**
 * Boîte de réception (HEP-89). Garde admin en tête, écriture et journal dans
 * la même transaction — comme toute action du back-office.
 */
export const setMessageStatusAction = action(
  messageStatusSchema,
  async ({ id, status }) => {
    const { actorId } = await requireAdminAction();
    await db.$transaction((tx) => setMessageStatus(tx, id, status, actorId));
    // Le compteur de la navigation vit dans le layout.
    revalidatePath("/admin", "layout");
    return { id, status };
  },
  { name: "admin.message.status" },
);
