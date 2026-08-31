# Commandes et prix — mode d'emploi

Comment appeler le moteur de commandes sans se tromper. Pour installer le
projet, voir [`DEMARRAGE.md`](./DEMARRAGE.md) ; pour le *pourquoi* de
l'architecture, [`BACKEND.md`](./BACKEND.md).

Tout ce qui suit vit dans `src/server/services/` :

| Fichier       | Rôle                                              | Issue          |
| ------------- | ------------------------------------------------- | -------------- |
| `pricing.ts`  | Calcul des montants — **pur, sans I/O**           | HEP-47         |
| `cart.ts`     | Panier serveur, réservations de stock             | HEP-46, HEP-48 |
| `orders.ts`   | Création, cycle de vie, annulation, idempotence   | HEP-52 → 55    |
| `stock.ts`    | Décrément atomique, mouvements, coffrets          | HEP-41, HEP-40 |

## Les trois règles

**1. Un service reçoit `db` ou `tx` en premier argument.** Il ne lit jamais de
cookie, de header ni de session — c'est le travail de la Server Action
appelante. Un service qui lit les cookies impose un serveur HTTP à chaque test.

**2. Tout ce qui touche à l'argent ou au stock s'appelle dans un
`$transaction`.** Le service ne décide pas du périmètre transactionnel,
l'appelant si.

**3. Le client ne transmet jamais de prix.** Le panier ne stocke que des
couples `(productId, qty)` ; les montants sont recalculés en base à chaque
affichage.

---

## Calculer des montants

`computeTotals` est **pure** : ni Prisma, ni `Date.now()`, ni réseau. C'est la
**seule** implémentation des montants dans tout le projet — affichage du
panier, session Stripe, création de la commande, facture. Deux
implémentations, ce sont deux montants différents et un litige client que
personne ne peut trancher.

```ts
import { computeTotals } from "@/server/services/pricing";

const totals = computeTotals({
  lines: [
    { productId: "…", qty: 2, unitPriceCents: 2000 }, // prix TTC, relu en base
    { productId: "…", qty: 1, unitPriceCents: 4900 },
  ],
  discount: {              // déjà validée par le moteur de codes promo (HEP-75)
    code: "FORGE10",
    type: "PERCENT",       // FIXED | PERCENT | FREE_SHIPPING
    value: 1000,           // points de base pour PERCENT, centimes pour FIXED
    minOrderCents: 6000,
    productId: null,       // null = tout le panier
  },
  shipping: { priceCents: 590, freeAboveCents: 6000 },
  vatRateBps: 2000,        // défaut : 20,00 %
});
```

Elle rend :

```ts
{
  lines: [{ productId, qty, unitPriceCents, lineTotalCents, discountCents, netCents }],
  subtotalCents, discountCents, shippingCents, taxCents, totalCents,
  vatRateBps, shippingKnown, freeShipping,
  discountCode, discountRejectedFor,
}
```

### L'ordre est figé

1. sous-total ;
2. remise ;
3. livraison — **après** la remise, pour que le franco se juge sur ce que le
   client paie réellement ;
4. TVA, **extraite** du total TTC ;
5. total.

Le changer casse les tests, et c'est voulu.

### Ce qu'il faut savoir avant de l'appeler

**La TVA est extraite, jamais ajoutée.** En B2C France le prix annoncé est le
prix payé. 15,00 € affichés contiennent 250 centimes de TVA. `total × 0,20`
donnerait 300 : faux de 50 centimes par produit, et la facture ne tombe plus
juste. `taxIncludedIn(amountCents, vatRateBps)` est exposée à part pour les
lignes de facture et les remboursements partiels.

**Le franco se juge après la remise.** Un panier de 87 € remisé à 40 % ne paie
que 52,20 € : lui offrir le port au seuil de 60 € reviendrait à financer sa
remise deux fois.

**`shippingKnown: false` veut dire que `totalCents` est un total *hors
livraison*.** Tant qu'aucun mode n'est passé, l'afficher comme montant final
serait un mensonge — et une infraction à l'article L112-1 du code de la
consommation. C'est le cas dans le panier, où l'UI affiche « calculée à
l'étape suivante ».

**La remise est ventilée au prorata sur `lines[].discountCents`**, par la
méthode du plus fort reste : la somme des parts égale *exactement*
`discountCents`. C'est ce qui permet à une facture de tomber juste et à un
remboursement partiel de rendre le bon montant. Pour rembourser une ligne,
utiliser `netCents`, jamais `lineTotalCents`.

**Une remise refusée n'est pas une erreur.** `discountRejectedFor` vaut
`"BELOW_MINIMUM"` ou `"NOT_APPLICABLE"` et l'UI décide quoi en dire.

### Côté client aussi

`pricing.ts` est **le seul fichier de `src/server/` que le client a le droit
d'importer**, et précisément parce qu'il est pur : sa seule dépendance est un
`import type`, effacé à la compilation. L'affichage optimiste du panier
(`src/lib/cart-queries.ts`) l'utilise pour calculer comme le serveur — sinon le
montant sauterait au retour de la requête.

---

## Passer une commande

### 1. La clé d'idempotence

Au rendu de la page panier, avant tout formulaire :

```ts
import { cartIdempotencyKey } from "@/server/services/orders";

const key = await cartIdempotencyKey(db, cartToken); // → champ caché
```

Elle est **dérivée du panier** (`cart.id`, `updatedAt`, contenu), pas tirée au
sort. Un `randomUUID` changerait à chaque rendu : deux onglets, ou un
rechargement pendant la requête, repartiraient avec deux clés — donc deux
commandes. Dérivée, elle est stable pour un panier identique et change dès
qu'une ligne bouge.

### 2. La commande

```ts
import { placeOrder } from "@/server/services/orders";

const order = await placeOrder(db, {
  cartToken,
  email: "client@example.com",
  shippingAddress,          // validé par addressSchema (src/lib/validation/address.ts)
  billingAddress,           // optionnel — absent = identique à la livraison
  shipping: { priceCents: 590, freeAboveCents: 6000 },
  discount,                 // déjà validée (HEP-75)
  idempotencyKey: key,
});
// → { id, number, publicToken, replayed }
```

⚠️ `placeOrder` prend **`db` et non `tx`**, seule entorse à la règle du
répertoire : un conflit d'unicité avorte la transaction Postgres qui l'a
déclenché, la relecture doit donc se faire en dehors. Elle pilote sa
transaction elle-même.

**`replayed: true` signifie que la commande existait déjà** pour cette clé. Il
faut alors **réutiliser** la session Stripe rattachée à cette commande, jamais
en créer une seconde. C'est là que se joue le « un seul débit ».

### 3. L'ordre, qui n'est pas interchangeable

```
1. INSERT de la commande      → conflit d'unicité = quelqu'un est déjà passé
2. si conflit                 → relire la commande existante et la renvoyer
3. sinon                      → créer la session Stripe avec la MÊME clé
```

Créer la session Stripe **avant** l'insertion laisserait deux sessions ouvertes
sur le même panier. La base d'abord, toujours.

Le bouton désactivé et le témoin de chargement côté client sont du confort. Ils
ne protègent d'aucun cas réel — double-tap avant l'hydratation React,
rechargement pendant la requête, retour arrière puis re-soumission, connexion
instable qui rejoue la requête. La garantie est en base.

### Ce que `createOrder` fige

Les lignes sont **recopiées** dans `OrderItem` (nom, SKU, prix), pas
référencées. Changer le prix d'un produit demain ne doit pas changer le montant
d'une commande d'hier. Le panier, lui, ne fige rien : il affiche toujours le
prix du jour.

`number` est séquentiel et lisible (`HF-2026-0001`), `publicToken` est aléatoire
et sert au suivi sans compte — deviner le numéro d'un voisin ne donne accès à
rien.

---

## Faire vivre une commande

### La table de transitions

`ORDER_TRANSITIONS` est explicite, et **tout ce qui n'y figure pas est refusé** :

| Depuis               | Vers                                                       |
| -------------------- | ---------------------------------------------------------- |
| `PENDING`            | `PAID`, `CANCELED`                                          |
| `PAID`               | `PREPARING`, `CANCELED`, `PARTIALLY_REFUNDED`, `REFUNDED`   |
| `PREPARING`          | `SHIPPED`, `CANCELED`, `PARTIALLY_REFUNDED`, `REFUNDED`     |
| `SHIPPED`            | `DELIVERED`, `PARTIALLY_REFUNDED`, `REFUNDED`               |
| `DELIVERED`          | `PARTIALLY_REFUNDED`, `REFUNDED`                            |
| `PARTIALLY_REFUNDED` | `REFUNDED`                                                  |
| `CANCELED`           | — terminal                                                  |
| `REFUNDED`           | — terminal                                                  |

`canTransition(from, to)` répond sans écrire, pour griser un bouton en amont.

### Changer d'état

```ts
await db.$transaction(async (tx) => {
  const { changed, email } = await transitionOrder(tx, {
    orderId,
    to: "SHIPPED",
    actor: { kind: "admin", id: adminId },
    note: "Colis 1Z999…",     // motif, référence Stripe, numéro de suivi
  });
  if (email) await queueEmail(email, orderId);   // HEP-66
});
```

⚠️ **Dans un `$transaction`.** L'état et le journal doivent tomber ou passer
ensemble : un état changé sans événement rend le journal menteur.

L'`actor` est obligatoire et fermé : `admin`, `customer`, `system` (cron,
relance) ou `stripe` (le webhook). Il finit dans `OrderEvent.actorId`.

**`changed: false` n'est pas une erreur.** La commande était déjà dans l'état
demandé — le webhook Stripe rejoue ses événements, et un rejeu doit être
silencieux : aucun événement journalisé, aucun mail demandé. C'est ce qui évite
le second « commande confirmée ».

### Les mails

`TRANSITION_EMAIL` déclare le gabarit de chaque état, **ici et nulle part
ailleurs**. C'est cette table qui garantit « exactement un mail, jamais zéro ni
deux » : envoyer depuis l'admin *et* depuis le webhook en produirait deux.

`null` est une décision, pas un trou. `PREPARING` est un état interne ;
`DELIVERED` est déjà notifié par le transporteur. Une commande en précommande
reçoit une variante (`precommande-enregistree`, `precommande-expediee`).

`transitionOrder` **ne fait qu'annoncer** le gabarit à envoyer. L'envoi
lui-même appartient à l'appelant, hors transaction — un mail parti ne se
rollback pas.

### Lire le journal

```ts
const events = await listOrderEvents(db, orderId);
// [{ from, to, actorId, note, createdAt }, …]
```

---

## Annuler

```ts
await db.$transaction((tx) =>
  cancelOrder(tx, {
    orderId,
    reason: "Rupture fournisseur",      // OBLIGATOIRE
    actor: { kind: "admin", id: adminId },
    refund: async () => {               // requis si la commande est payée
      await stripe.refunds.create(
        { payment_intent: pi },
        { idempotencyKey: `refund-${orderId}` },
      );
    },
  }),
);
// → { restocked, email, releasedDiscountCode }
```

L'état, l'argent et le stock, ou rien.

**Le remboursement est injecté**, le service ne parle pas au réseau. Il est
appelé **avant** toute écriture : s'il lève, le rollback emporte l'annulation,
la remise en stock et le journal. La commande reste payée et l'erreur remonte.

**Une commande payée ne peut pas être annulée sans `refund`** — ce serait une
commande disparue et un client débité. C'est refusé.

**Une commande `PENDING` ne rend rien.** Le stock n'est pris qu'à
l'encaissement : lui « remettre » son stock inventerait des flacons, et
l'inventaire dériverait sans que rien n'alerte. La remise en stock est
reconstruite depuis les **mouvements `SALE` de la commande**, pas depuis ses
lignes — on rend exactement ce qui a été pris, y compris quand la composition
d'un coffret a changé depuis la vente.

**Après expédition, c'est refusé** : le produit est dehors, il faut passer par
une demande de retour (lot 7), seul endroit où l'on décide si le cosmétique
ouvert revient en stock ou part au rebut.

Le code promo est rendu à son porteur : `DiscountRedemption` supprimée,
`usedCount` décrémenté.

### La fenêtre que rien ne ferme

Le remboursement réussit, puis le commit échoue : l'argent est rendu, la
commande est encore payée. Aucune transaction ne couvre un appel réseau
externe. C'est pourquoi l'appel Stripe **doit** porter une `Idempotency-Key`
dérivée de la commande : le rejeu de l'annulation ne rembourse pas deux fois et
rattrape l'état.

---

## Stock et coffrets

Le stock a **un seul point d'écriture**. Un `db.product.update({ data: { stock } })`
écrit ailleurs contournerait l'historique et rendrait le stock irréconciliable.

```ts
await db.$transaction(async (tx) => {
  await sellProduct(tx, { productId, qty, reason: "SALE", orderId });
});
```

`sellProduct` et `restockProduct` décomposent automatiquement un **coffret** en
ses composants : le coffret n'a pas de stock propre, un mouvement à son nom
fausserait la somme. Le décrément passe par la fonction `decrement_stock()` en
base, jamais par un `SELECT` suivi d'un `UPDATE`.

`stockFromMovements(tx, productId)` recalcule le stock depuis l'historique. Il
doit toujours retomber sur `Product.stock` — c'est le contrôle de cohérence.

---

## Erreurs

Un service lève une `ActionError` avec un `ErrorCode` **fermé**
(`src/server/errors.ts`), jamais une chaîne libre :

```ts
throw new ActionError("OUT_OF_STOCK", "« Sérum » est épuisé.");
```

L'UI décide de son comportement sur le **code**, pas sur le texte du message —
qui n'est fait que pour être lu. Un service ne renvoie jamais `null` pour dire
« rupture » : l'appelant ne saurait pas distinguer une rupture d'un produit
inexistant.

Le helper `action()` (`src/server/action.ts`) transforme une `ActionError` en
réponse propre. Tout ce qui n'est pas une `ActionError` est un bug : `INTERNAL`
côté client, détail chez Sentry.

---

## Ce qui n'est pas encore là

`placeOrder` et `cancelOrder` attendent les fonctions Stripe qu'on leur passe :
le compte (HEP-57), le tunnel (HEP-58) et le webhook (HEP-59) restent à faire.
Les points d'accroche existent et sont testés — c'est du branchement, pas de la
conception.

L'envoi réel des mails vient avec HEP-66 ; aujourd'hui le moteur nomme les
gabarits sans les envoyer. Le moteur de codes promo est HEP-75 : `computeTotals`
et `createOrder` reçoivent une remise **déjà validée**, ils ne vérifient ni les
dates ni les quotas.
