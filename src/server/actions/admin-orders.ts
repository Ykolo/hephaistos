"use server";

import {
  cancelOrderSchema,
  changeOrderStatusSchema,
  orderNoteSchema,
} from "@/lib/validation/admin-order";
import { action } from "../action";
import { db } from "../db";
import { guardAdminAction, PROVISIONAL_ACTOR_ID } from "../admin-guard";
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

const ADMIN = { kind: "admin", id: PROVISIONAL_ACTOR_ID } as const;

export const changeOrderStatus = action(
  changeOrderStatusSchema,
  async ({ orderId, to, note }) => {
    guardAdminAction();
    return db.$transaction((tx) =>
      transitionOrder(tx, { orderId, to, actor: ADMIN, note }),
    );
  },
  { name: "admin.order.status" },
);

export const saveOrderNote = action(
  orderNoteSchema,
  async ({ orderId, note }) => {
    guardAdminAction();
    await db.$transaction((tx) => setInternalNote(tx, orderId, note, ADMIN));
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
    guardAdminAction();
    const result = await db.$transaction((tx) =>
      cancelOrder(tx, { orderId, reason, actor: ADMIN }),
    );
    return { restocked: result.restocked.length };
  },
  { name: "admin.order.cancel" },
);
