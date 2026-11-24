"use server";

import {
  cancelOrderSchema,
  changeOrderStatusSchema,
  orderNoteSchema,
} from "@/lib/validation/admin-order";
import { action } from "../action";
import { db } from "../db";
import { requireAdminAction } from "../admin-guard";
import { recordAdminWrite } from "../audit";
import { cancelOrder, setInternalNote, transitionOrder } from "../services/orders";

/**
 * Écritures sur une commande depuis l'administration (HEP-56).
 *
 * Aucune logique métier ici : la table de transitions, le journal et la
 * remise en stock vivent dans `services/orders.ts`. Ces actions se contentent
 * de garder la porte, de valider l'entrée et d'ouvrir la transaction.
 *
 * Les mails que renvoient les transitions (`email`) ne partent pas encore :
 * la file d'envoi arrive avec HEP-66, et c'est elle qui les consommera.
 */

/** Auteur des écritures : l'admin connecté, vérifié par `requireAdminAction`. */
async function currentAdmin() {
  const { actorId } = await requireAdminAction();
  return { kind: "admin", id: actorId } as const;
}

export const changeOrderStatus = action(
  changeOrderStatusSchema,
  async ({ orderId, to, note }) => {
    const admin = await currentAdmin();
    return db.$transaction(async (tx) => {
      const result = await transitionOrder(tx, { orderId, to, actor: admin, note });
      // `OrderEvent` raconte la vie de la commande ; `AuditLog` répond à
      // « qu'a fait cet admin ? ». Les deux, dans la même transaction.
      await recordAdminWrite(tx, {
        actorId: admin.id,
        entity: "Order",
        entityId: orderId,
        action: "status.change",
        diff: { to, note: note ?? null },
      });
      return result;
    });
  },
  { name: "admin.order.status" },
);

export const saveOrderNote = action(
  orderNoteSchema,
  async ({ orderId, note }) => {
    const admin = await currentAdmin();
    await db.$transaction((tx) => setInternalNote(tx, orderId, note, admin));
    return { saved: true };
  },
  { name: "admin.order.note" },
);

/**
 * Annulation depuis la fiche.
 *
 * Sans remboursement branché (Stripe, HEP-58 à HEP-60), seule une commande
 * **non payée** peut être annulée : le service refuse d'annuler une commande
 * encaissée sans rendre l'argent, et c'est exactement ce qu'on veut.
 */
export const cancelOrderFromAdmin = action(
  cancelOrderSchema,
  async ({ orderId, reason }) => {
    const admin = await currentAdmin();
    const result = await db.$transaction(async (tx) => {
      const cancelled = await cancelOrder(tx, { orderId, reason, actor: admin });
      await recordAdminWrite(tx, {
        actorId: admin.id,
        entity: "Order",
        entityId: orderId,
        action: "cancel",
        diff: { reason, restocked: cancelled.restocked },
      });
      return cancelled;
    });
    return { restocked: result.restocked.length };
  },
  { name: "admin.order.cancel" },
);
