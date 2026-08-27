"use server";

import { batchSchema, recallSchema } from "@/lib/validation/product";
import { action, formAction } from "../action";
import { db } from "../db";
import { guardAdminAction, PROVISIONAL_ACTOR_ID } from "../admin-guard";
import { ActionError } from "../errors";
import {
  recallByBatch,
  recallToCsv,
  receiveBatch,
  type RecallResult,
} from "../services/batches";

/** Réception de marchandise : enregistre le lot et met le stock à jour. */
export const saveBatch = formAction(
  batchSchema,
  async (input) => {
    guardAdminAction();

    const product = await db.product.findUnique({
      where: { slug: input.productSlug },
      select: { id: true },
    });
    if (!product) throw new ActionError("NOT_FOUND", "Ce produit est introuvable.");

    const result = await receiveBatch(db, {
      productId: product.id,
      code: input.code,
      quantity: input.quantity,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      actorId: PROVISIONAL_ACTOR_ID,
    });

    return { batchId: result.batchId, stock: result.stock };
  },
  { name: "admin.batch.receive" },
);

/**
 * Rappel produit : renvoie les clients concernés **et** le CSV prêt à ouvrir.
 *
 * Le CSV est produit ici plutôt que côté client : il doit contenir exactement
 * ce que l'écran affiche, y compris les lignes non tracées. Deux générations
 * séparées finiraient par diverger, et c'est le jour d'un rappel qu'on s'en
 * apercevrait.
 */
export const searchRecall = action(
  recallSchema,
  async ({ code }): Promise<RecallResult & { csv: string }> => {
    guardAdminAction();
    const result = await recallByBatch(db, code);
    return { ...result, csv: recallToCsv(result) };
  },
  { name: "admin.batch.recall" },
);
