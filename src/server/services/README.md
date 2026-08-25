# Services métier

Toute la logique de vente vit ici : catalogue, stock, panier, prix, commandes,
checkout, livraison, remises, factures.

## La seule règle

**Un service est pur.** Il reçoit le client Prisma (ou une transaction) en
premier argument et ne lit jamais de cookie, de header ni de session.

```ts
// oui — testable sans HTTP (lot 10, HEP-83)
export async function reserveStock(db: Tx, productId: string, qty: number) { … }

// non — impossible à tester unitairement
export async function reserveStock(productId: string, qty: number) {
  const session = await auth(); // lit les cookies
}
```

Lire la session est le travail de la Server Action appelante, pas du service.
Un service qui lit les cookies impose un serveur HTTP à chaque test, et les
trois invariants critiques de `docs/BACKEND.md` §4 — le dernier flacon vendu
deux fois, le double débit, la commande perdue — sont précisément ce qu'on ne
peut pas se permettre de tester à la main.

## Transactions

Les opérations qui touchent au stock ou à l'argent reçoivent un `Tx`
(`src/server/db.ts`) et non `db` : l'appelant décide du périmètre de la
transaction, pas le service. Le décrément de stock passe obligatoirement par
`decrement_stock()` en base, jamais par un `SELECT` suivi d'un `UPDATE`.

## Erreurs

Un service lève une `ActionError` avec un `ErrorCode` fermé
(`src/server/errors.ts`). Il ne renvoie jamais `null` pour dire « rupture » :
l'appelant ne saurait pas distinguer une rupture d'un produit inexistant.
