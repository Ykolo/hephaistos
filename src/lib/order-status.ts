import type { ORDER_STATUSES } from "./validation/admin-order";

type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Libellés et pastilles des états de commande, pour l'administration.
 *
 * Partagé serveur / client : les composants interactifs de la fiche en ont
 * besoin, et l'énumération Prisma ne doit pas être importée côté navigateur.
 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "En attente de paiement",
  PAID: "Payée",
  PREPARING: "En préparation",
  SHIPPED: "Expédiée",
  DELIVERED: "Livrée",
  CANCELED: "Annulée",
  REFUNDED: "Remboursée",
  PARTIALLY_REFUNDED: "Remb. partiel",
};

/**
 * Le noir est réservé à ce qui demande une action (payée, en préparation) :
 * c'est ce que l'œil doit trouver en premier dans la liste.
 */
export const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING: "bg-transparent text-muted-ink border border-line",
  PAID: "bg-ink text-white",
  PREPARING: "bg-ink text-white",
  SHIPPED: "bg-sand text-body",
  DELIVERED: "bg-sand text-muted-ink",
  CANCELED: "bg-transparent text-muted-ink2 border border-line line-through",
  REFUNDED: "bg-transparent text-muted-ink2 border border-line",
  PARTIALLY_REFUNDED: "bg-gold/15 text-body border border-gold/40",
};
