import type { Tx } from "../db";
import { ActionError } from "../errors";
import type { StockReason } from "@/generated/prisma/client";

/**
 * Stock — **seul** point d'écriture sur `Product.stock` (HEP-41).
 *
 * Toute variation passe par ici et laisse une trace dans `StockMovement`.
 * Un `db.product.update({ data: { stock } })` écrit ailleurs contournerait
 * l'historique et rendrait le stock irréconciliable : la somme des mouvements
 * ne correspondrait plus à la valeur courante, et plus personne ne saurait
 * laquelle est juste.
 *
 * Service pur au sens de `README.md` : il reçoit la transaction, ne lit ni
 * cookie ni header.
 */

type MovementContext = {
  /** Commande à l'origine du mouvement, quand il y en a une. */
  orderId?: string;
  /** Administrateur auteur d'un ajustement manuel. */
  actorId?: string;
  note?: string;
};

export type StockChange = MovementContext & {
  productId: string;
  qty: number;
  reason: StockReason;
};

/** Ce que l'appelant apprend d'un mouvement réussi. */
export type StockResult = {
  /** Stock après opération. Négatif = précommandes dues. */
  remaining: number;
  /**
   * Vrai uniquement au moment où le stock **franchit** le seuil d'alerte.
   * Permet d'envoyer un mail une fois par franchissement et non à chaque
   * commande passée sous le seuil.
   */
  crossedLowStockThreshold: boolean;
};

async function recordMovement(
  tx: Tx,
  change: StockChange,
  delta: number,
): Promise<void> {
  await tx.stockMovement.create({
    data: {
      productId: change.productId,
      delta,
      reason: change.reason,
      orderId: change.orderId ?? null,
      actorId: change.actorId ?? null,
      note: change.note ?? null,
    },
  });
}

/**
 * Détecte le franchissement du seuil d'alerte.
 *
 * `avant > seuil >= après` : on ne déclenche qu'à la transition. Un produit
 * déjà sous le seuil ne redéclenche rien, sinon chaque commande enverrait un
 * mail et l'alerte deviendrait du bruit qu'on finit par ignorer.
 */
function crossedThreshold(
  before: number,
  after: number,
  threshold: number,
): boolean {
  return before > threshold && after <= threshold;
}

/**
 * Sortie de stock — vente, principalement.
 *
 * Le décrément est **atomique et conditionnel** : la condition `stock >= qty`
 * est évaluée par Postgres sous le verrou de ligne de l'UPDATE, pas par nous
 * après une lecture. C'est ce qui empêche deux commandes simultanées
 * d'emporter le même dernier flacon (docs/BACKEND.md §4.1).
 *
 * À appeler **dans** la transaction qui crée la commande. Si elle échoue plus
 * loin, le stock est rendu par le rollback.
 *
 * @throws ActionError OUT_OF_STOCK — l'appelant doit annuler toute la transaction.
 */
export async function decrementStock(
  tx: Tx,
  change: StockChange,
): Promise<StockResult> {
  if (change.qty <= 0) {
    throw new ActionError("VALIDATION", "La quantité doit être supérieure à zéro.");
  }

  const product = await tx.product.findUnique({
    where: { id: change.productId },
    select: { availability: true, lowStockAlert: true, name: true },
  });

  if (!product) {
    throw new ActionError("NOT_FOUND", "Ce produit est introuvable.");
  }

  // Une précommande se vend sans stock : c'est sa raison d'être (HEP-42). Le
  // stock devient négatif et représente alors les flacons dus.
  if (product.availability === "PREORDER") {
    const updated = await tx.product.update({
      where: { id: change.productId },
      data: { stock: { decrement: change.qty } },
      select: { stock: true },
    });
    await recordMovement(tx, change, -change.qty);
    return { remaining: updated.stock, crossedLowStockThreshold: false };
  }

  // `decrement_stock` renvoie le stock restant, ou NULL si la condition
  // `stock >= qty` n'est pas satisfaite.
  const rows = await tx.$queryRaw<{ decrement_stock: number | null }[]>`
    SELECT decrement_stock(${change.productId}, ${change.qty})
  `;
  const remaining = rows[0]?.decrement_stock ?? null;

  if (remaining === null) {
    throw new ActionError(
      "OUT_OF_STOCK",
      `« ${product.name} » n'est plus disponible en quantité suffisante.`,
    );
  }

  await recordMovement(tx, change, -change.qty);

  return {
    remaining,
    crossedLowStockThreshold: crossedThreshold(
      remaining + change.qty,
      remaining,
      product.lowStockAlert,
    ),
  };
}

/**
 * Entrée de stock — réassort, annulation, remboursement.
 *
 * Aucune condition à vérifier : ajouter du stock ne peut pas échouer par
 * concurrence. L'incrément reste néanmoins atomique côté Postgres.
 */
export async function incrementStock(
  tx: Tx,
  change: StockChange,
): Promise<StockResult> {
  if (change.qty <= 0) {
    throw new ActionError("VALIDATION", "La quantité doit être supérieure à zéro.");
  }

  const updated = await tx.product.update({
    where: { id: change.productId },
    data: { stock: { increment: change.qty } },
    select: { stock: true },
  });

  await recordMovement(tx, change, change.qty);

  return { remaining: updated.stock, crossedLowStockThreshold: false };
}

/**
 * Ajustement manuel depuis l'admin — inventaire, casse, erreur de saisie.
 *
 * La note est **obligatoire** : un ajustement sans justification rend
 * l'historique inutilisable le jour où il faut expliquer un écart à un
 * comptable ou lors d'un rappel produit.
 */
export async function adjustStock(
  tx: Tx,
  params: {
    productId: string;
    /** Stock cible, pas un delta : c'est ce que compte l'humain. */
    newStock: number;
    actorId: string;
    note: string;
  },
): Promise<StockResult> {
  if (params.newStock < 0) {
    throw new ActionError("VALIDATION", "Le stock ne peut pas être négatif.");
  }
  if (!params.note.trim()) {
    throw new ActionError(
      "VALIDATION",
      "Une note est obligatoire pour justifier un ajustement manuel.",
    );
  }

  const product = await tx.product.findUnique({
    where: { id: params.productId },
    select: { stock: true, lowStockAlert: true },
  });
  if (!product) {
    throw new ActionError("NOT_FOUND", "Ce produit est introuvable.");
  }

  const delta = params.newStock - product.stock;
  if (delta === 0) {
    return { remaining: product.stock, crossedLowStockThreshold: false };
  }

  await tx.product.update({
    where: { id: params.productId },
    data: { stock: params.newStock },
  });

  await recordMovement(
    tx,
    {
      productId: params.productId,
      qty: Math.abs(delta),
      reason: "MANUAL",
      actorId: params.actorId,
      note: params.note,
    },
    delta,
  );

  return {
    remaining: params.newStock,
    crossedLowStockThreshold: crossedThreshold(
      product.stock,
      params.newStock,
      product.lowStockAlert,
    ),
  };
}

/**
 * Reconstitue le stock en sommant l'historique.
 *
 * Sert de contrôle : cette somme doit toujours égaler `Product.stock`. Un
 * écart signifie qu'une écriture a contourné ce service — c'est le test qui
 * le détecte (DoD de HEP-41).
 */
export async function stockFromMovements(
  tx: Tx,
  productId: string,
): Promise<number> {
  const result = await tx.stockMovement.aggregate({
    where: { productId },
    _sum: { delta: true },
  });
  return result._sum.delta ?? 0;
}

/** Produits dont le stock est retombé au niveau d'alerte (tableau de bord, HEP-79). */
export async function listLowStockProducts(tx: Tx) {
  return tx.$queryRaw<
    { id: string; name: string; stock: number; lowStockAlert: number }[]
  >`
    SELECT "id", "name", "stock", "lowStockAlert"
      FROM "Product"
     WHERE "status" = 'PUBLISHED'
       AND "stock" <= "lowStockAlert"
     ORDER BY "stock" ASC
  `;
}
