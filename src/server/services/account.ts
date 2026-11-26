import type { Tx } from "../db";

/**
 * Rattache au compte les commandes passées sans compte avec la même adresse
 * (HEP-63).
 *
 * ⚠️ Le piège : rattacher sur simple correspondance d'email permettrait à
 * n'importe qui de créer un compte avec l'adresse d'un client et de lire son
 * historique — adresses, montants, produits. La vérification de l'adresse est
 * la seule barrière : sans `emailVerified`, cette fonction ne fait **rien**,
 * quel que soit l'appelant.
 *
 * Seules les commandes sans compte sont visées : une commande déjà rattachée
 * à un autre compte ne change jamais de propriétaire.
 */
export async function attachGuestOrders(
  tx: Tx,
  user: { id: string; email: string; emailVerified: boolean },
): Promise<number> {
  if (!user.emailVerified) return 0;
  const { count } = await tx.order.updateMany({
    // Insensible à la casse : l'adresse saisie au tunnel n'est pas normalisée,
    // celle du compte l'est (Better Auth la passe en minuscules).
    where: { userId: null, email: { equals: user.email, mode: "insensitive" } },
    data: { userId: user.id },
  });
  return count;
}

/** Commandes du compte, les plus récentes d'abord (espace client, HEP-63/64). */
export async function listAccountOrders(tx: Tx, userId: string) {
  return tx.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      number: true,
      createdAt: true,
      status: true,
      totalCents: true,
      _count: { select: { items: true } },
    },
  });
}
