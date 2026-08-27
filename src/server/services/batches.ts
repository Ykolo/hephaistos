import type { Tx } from "../db";
import type { OrderStatus } from "@/generated/prisma/client";
import { ActionError } from "../errors";
import { incrementStock } from "./stock";

/**
 * Numéros de lot — traçabilité en cas de rappel produit (HEP-44).
 *
 * Obligation cosmétique : pouvoir relier chaque envoi à un lot. Le jour d'un
 * rappel, la question n'est pas « combien » mais « qui exactement ».
 *
 * **Attribution manuelle, jamais automatique.** Une attribution FIFO serait
 * rigoureuse sur le papier et fausse dès que la préparation physique ne suit
 * pas cet ordre — et une traçabilité fausse est pire qu'absente : elle produit
 * une liste de clients incorrecte, donc des gens non prévenus qui se croient
 * en sécurité.
 */

/** Réception de marchandise : enregistre le lot et met le stock à jour. */
export async function receiveBatch(
  db: Tx,
  params: {
    productId: string;
    code: string;
    quantity: number;
    expiresAt: Date | null;
    actorId: string;
  },
): Promise<{ batchId: string; stock: number }> {
  const code = params.code.trim();
  if (!code) {
    throw new ActionError("VALIDATION", "Le numéro de lot est requis.");
  }
  if (params.quantity <= 0) {
    throw new ActionError("VALIDATION", "La quantité doit être supérieure à zéro.");
  }

  const product = await db.product.findUnique({
    where: { id: params.productId },
    select: { id: true, kind: true, name: true },
  });
  if (!product) throw new ActionError("NOT_FOUND", "Ce produit est introuvable.");
  if (product.kind === "BUNDLE") {
    // Un coffret n'est pas fabriqué : il est assemblé à partir de références
    // qui, elles, portent des lots. Lui en attribuer un rendrait le rappel
    // ambigu — on ne saurait pas quel flacon rappeler.
    throw new ActionError(
      "VALIDATION",
      "Un coffret ne porte pas de numéro de lot : saisissez les lots de ses composants.",
    );
  }

  const existing = await db.batch.findUnique({
    where: { productId_code: { productId: params.productId, code } },
    select: { id: true },
  });
  if (existing) {
    throw new ActionError(
      "VALIDATION",
      `Le lot « ${code} » existe déjà pour ce produit.`,
    );
  }

  const batch = await db.batch.create({
    data: {
      productId: params.productId,
      code,
      quantity: params.quantity,
      expiresAt: params.expiresAt,
    },
    select: { id: true },
  });

  // Le stock passe par le service dédié : c'est le seul point d'écriture, et
  // le mouvement porte le code du lot pour que l'historique reste lisible.
  const result = await incrementStock(db, {
    productId: params.productId,
    qty: params.quantity,
    reason: "RESTOCK",
    actorId: params.actorId,
    note: `Réception du lot ${code}`,
  });

  return { batchId: batch.id, stock: result.remaining };
}

/** Lots enregistrés, du plus récent au plus ancien. */
export async function listBatches(db: Tx, productId?: string) {
  return db.batch.findMany({
    where: productId ? { productId } : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      quantity: true,
      expiresAt: true,
      createdAt: true,
      product: { select: { slug: true, name: true, sku: true } },
    },
  });
}

/**
 * Attribue un lot à une ligne de commande, **au moment de la préparation**.
 *
 * Pas à la commande : entre les deux, le colis peut être préparé avec un autre
 * lot que celui prévu. C'est le geste de la personne qui emballe qui fait foi.
 */
export async function assignBatchToOrderItem(
  db: Tx,
  orderItemId: string,
  code: string,
  actorId: string,
): Promise<void> {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new ActionError("VALIDATION", "Le numéro de lot est requis.");
  }

  const item = await db.orderItem.findUnique({
    where: { id: orderItemId },
    select: { id: true, productId: true, orderId: true },
  });
  if (!item) throw new ActionError("NOT_FOUND", "Cette ligne de commande est introuvable.");

  if (item.productId) {
    // Le lot doit exister pour CE produit : saisir le lot du sérum sur une
    // ligne de crème donnerait un rappel qui désigne les mauvais clients.
    const batch = await db.batch.findUnique({
      where: { productId_code: { productId: item.productId, code: trimmed } },
      select: { id: true },
    });
    if (!batch) {
      throw new ActionError(
        "NOT_FOUND",
        `Aucun lot « ${trimmed} » n'est enregistré pour ce produit.`,
      );
    }
  }

  await db.orderItem.update({
    where: { id: orderItemId },
    data: { batchCode: trimmed },
  });

  await db.auditLog.create({
    data: {
      actorId,
      entity: "OrderItem",
      entityId: orderItemId,
      action: "batch.assign",
      diff: { lot: trimmed, commande: item.orderId },
    },
  });
}

export type RecallRow = {
  orderNumber: string;
  email: string;
  productName: string;
  qty: number;
  orderedAt: Date;
  shippedAt: Date | null;
};

export type RecallResult = {
  code: string;
  productName: string;
  /** Clients ayant reçu ce lot, de façon certaine. */
  affected: RecallRow[];
  /**
   * Lignes expédiées du même produit **sans lot renseigné**.
   *
   * Elles ne peuvent pas être écartées : faute d'information, il faut les
   * traiter comme potentiellement concernées. Les taire donnerait une liste
   * rassurante et fausse — exactement ce qu'un rappel ne peut pas se permettre.
   */
  untraced: RecallRow[];
};

/**
 * Rappel produit : à partir d'un code de lot, qui a reçu quoi.
 *
 * Renvoie deux listes séparées — les clients tracés avec certitude, et ceux
 * dont la ligne n'a pas de lot renseigné. La seconde doit rester visible :
 * c'est la mesure de ce qu'on ignore.
 */
export async function recallByBatch(db: Tx, code: string): Promise<RecallResult> {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new ActionError("VALIDATION", "Le numéro de lot est requis.");
  }

  const batch = await db.batch.findFirst({
    where: { code: trimmed },
    select: { productId: true, product: { select: { name: true } } },
  });
  if (!batch) {
    throw new ActionError(
      "NOT_FOUND",
      `Aucun lot « ${trimmed} » n'est enregistré.`,
    );
  }

  // Seules les commandes réellement parties comptent : une commande en cours
  // de préparation se corrige, elle ne se rappelle pas.
  const shipped = { in: ["SHIPPED", "DELIVERED"] satisfies OrderStatus[] };

  const toRow = (i: {
    qty: number;
    nameSnapshot: string;
    order: { number: string; email: string; createdAt: Date; shippedAt: Date | null };
  }): RecallRow => ({
    orderNumber: i.order.number,
    email: i.order.email,
    productName: i.nameSnapshot,
    qty: i.qty,
    orderedAt: i.order.createdAt,
    shippedAt: i.order.shippedAt,
  });

  const select = {
    qty: true,
    nameSnapshot: true,
    order: {
      select: { number: true, email: true, createdAt: true, shippedAt: true },
    },
  };

  const [affected, untraced] = await Promise.all([
    db.orderItem.findMany({
      where: { batchCode: trimmed, order: { status: shipped } },
      select,
      orderBy: { order: { createdAt: "asc" } },
    }),
    db.orderItem.findMany({
      where: {
        productId: batch.productId,
        batchCode: null,
        order: { status: shipped },
      },
      select,
      orderBy: { order: { createdAt: "asc" } },
    }),
  ]);

  return {
    code: trimmed,
    productName: batch.product.name,
    affected: affected.map(toRow),
    untraced: untraced.map(toRow),
  };
}

/**
 * Export CSV de la liste de rappel.
 *
 * Séparateur point-virgule et BOM UTF-8 : c'est ce qu'attend Excel en
 * configuration française. Avec une virgule, tout atterrit dans une seule
 * colonne ; sans BOM, les accents sont illisibles. Un export qu'on ne peut pas
 * ouvrir le jour d'un rappel ne sert à rien.
 */
export function recallToCsv(result: RecallResult): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const date = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  const header = [
    "Commande",
    "Email",
    "Produit",
    "Quantité",
    "Commandé le",
    "Expédié le",
    "Traçabilité",
  ];

  const line = (r: RecallRow, traced: boolean) =>
    [
      escape(r.orderNumber),
      escape(r.email),
      escape(r.productName),
      String(r.qty),
      date(r.orderedAt),
      date(r.shippedAt),
      escape(traced ? "Lot confirmé" : "Lot inconnu — à traiter par précaution"),
    ].join(";");

  const rows = [
    ...result.affected.map((r) => line(r, true)),
    ...result.untraced.map((r) => line(r, false)),
  ];

  return "﻿" + [header.join(";"), ...rows].join("\r\n") + "\r\n";
}
