# Démarrage — faire tourner Héphaïstos en local

Le guide du premier jour. Pour l'architecture et les décisions, voir
[`BACKEND.md`](./BACKEND.md) ; pour l'usage du moteur de commandes, voir
[`COMMANDES.md`](./COMMANDES.md).

## Ce qu'il faut avoir

| Outil      | Pourquoi                                     |
| ---------- | -------------------------------------------- |
| **bun**    | Gestionnaire de paquets et lanceur du projet |
| **Docker** | La base Postgres jetable des tests           |

Aucune version n'est épinglée dans `package.json`. Le projet tourne
aujourd'hui sur bun 1.4 et Node 26 ; Next.js 16 demande Node 20 au minimum.

Le projet utilise **bun**, pas npm ni pnpm. `bun.lock` est versionné ; un
`npm install` produirait un arbre de dépendances différent.

## Installation

```bash
git clone https://github.com/Ykolo/hephaistos.git
cd hephaistos
bun install
cp .env.example .env.local
```

`.env.example` est versionné et **ne contient aucun secret** : uniquement les
clés attendues et leur forme. Chaque bloc dit à quoi il sert et quelle issue
Linear le remplira.

Pour démarrer, seules quatre clés comptent :

```bash
DATABASE_URL="postgresql://hep:hep@localhost:55432/hephaistos"
DIRECT_URL="postgresql://hep:hep@localhost:55432/hephaistos"
BETTER_AUTH_SECRET="…"                    # openssl rand -base64 32
BETTER_AUTH_URL="http://localhost:3000"   # le port réellement utilisé
```

`BETTER_AUTH_URL` doit correspondre au port du serveur de dev : si le 3000 est
pris et que Next démarre sur le 3001, la connexion est refusée (contrôle
d'origine) tant que la variable n'est pas corrigée.

## La base de données

### En local : la base jetable

```bash
bun run db:local:up      # Postgres 17 dans Docker, port 55432
bun run db:migrate       # applique les migrations
bun run db:seed          # les 3 produits + le coffret
```

Port **55432** et non 5432, volontairement : si un Postgres tourne déjà sur ta
machine, les deux cohabitent sans se marcher dessus.

Pour repartir de zéro :

```bash
bun run db:local:down && bun run db:local:up && bun run db:migrate && bun run db:seed
```

### Les deux chaînes de connexion

`DATABASE_URL` et `DIRECT_URL` **ne sont pas interchangeables** :

- `DATABASE_URL` est la chaîne **poolée** (l'hôte Neon contient `-pooler`).
  C'est celle de l'application. Sans le pooler, chaque invocation de fonction
  ouvre une connexion et Neon sature.
- `DIRECT_URL` est la chaîne **directe**, utilisée par les migrations : elles
  ont besoin de verrous consultatifs et d'une shadow database, deux choses que
  le pooler ne sait pas faire.

En local elles pointent au même endroit, il n'y a pas de pooler. En
préproduction et en production, elles diffèrent — et si `DIRECT_URL` manque,
`prisma migrate deploy` échoue en CI.

### Sur Neon

```bash
vercel env pull .env.local     # une fois le projet lié
```

⚠️ **Le même endpoint Neon héberge aussi la base d'un autre projet.** Vérifie
toujours le nom de la base dans la chaîne avant de lancer quoi que ce soit
d'écrivant.

## Lancer le site

```bash
bun run dev        # http://localhost:3000
```

Dix routes publiques : `/`, `/boutique`, `/produit/[id]`, `/panier`,
`/histoire`, `/vision`, `/avis`, `/contact`, `/newsletter`, `/legal`.

Et le compte client (HEP-63), en `noindex` : `/connexion`, `/inscription`,
`/mot-de-passe-oublie`, `/reinitialiser`, `/compte`. Sans clé Resend, les
liens de confirmation et de réinitialisation s'affichent dans la console du
serveur de dev.

Deux règles à ne pas casser :

- **les commandes passées sans compte** rejoignent le compte qui a la même
  adresse, mais seulement une fois l'adresse **vérifiée**
  (`attachGuestOrders`). Sans cette barrière, n'importe qui lirait
  l'historique d'un client en s'inscrivant avec son email ;
- **à la connexion, le panier invité fusionne** avec celui du compte
  (`mergeCartsOnSignIn`, HEP-49) : quantité = max des deux, jamais la somme,
  et le cookie de panier change de jeton. Le tout passe par un seul hook
  (`afterSessionHook` dans `src/server/auth.ts`), quel que soit le chemin qui
  ouvre la session.

Les codes promo (HEP-75) se gèrent dans `/admin/codes-promo`. Trois moments,
trois fonctions de `src/server/services/discounts.ts`, à ne pas confondre :

- **saisie** dans le panier (`checkDiscount`) : rien n'est consommé ;
- **création de la commande** (`claimDiscountForOrder`, appelé par
  `createOrder`) : revalidation complète **sous verrou** ; une commande
  `PENDING` garde sa place sur un code limité pendant la durée d'une session
  Stripe. C'est ce qui empêche un code à usage unique de passer deux fois ;
- **paiement confirmé** (`redeemDiscount`, à appeler par le webhook HEP-59) :
  seul endroit où `usedCount` augmente.

Les frais de port (HEP-70) viennent de la grille `ShippingRate`, éditée dans
`/admin/livraison` et remplie par le seed. Le client choisit son mode **dans
le panier** (le Checkout Stripe hébergé ne sait pas afficher de point relais) ;
`createOrder` relit ce mode et le tarif en base, et refuse de créer une
commande sans mode. Le choix de la tranche est dans `src/lib/shipping.ts`,
pur, pour que le navigateur et le serveur tombent sur le même prix. Les tests
qui créent une commande remplacent la grille le temps du fichier
(`withTestShippingGrid`) et la restaurent ensuite.

## Les tests

```bash
bun run test           # toute la suite
bun run test:watch     # en continu
bun run test tests/pricing.test.ts    # un fichier
```

Les tests écrivent et suppriment des données. Deux protections :

1. ils lisent `DIRECT_URL` ?? `DATABASE_URL`, et **refusent de démarrer** si
   l'URL pointe vers Neon — sauf avec `TEST_ON_NEON_BRANCH=1`, réservé à une
   branche Neon **jetable**, créée pour l'occasion (sans Docker, c'est la
   seule façon de lancer la suite) ;
2. `fileParallelism` est désactivé — les tests de concurrence partagent une
   base, les paralléliser ferait échouer les assertions sur le stock pour de
   mauvaises raisons.

Si la suite se plaint d'une table manquante, c'est que la base jetable n'a pas
les dernières migrations : `bun run db:migrate`.

Les tests du moteur de prix (`tests/pricing.test.ts`) sont les seuls à ne pas
avoir besoin de base du tout — la fonction est pure.

## Avant de pousser

```bash
bun run typecheck && bun run lint && bun run test && bun run build
```

`bun run build` n'est pas facultatif : `cacheComponents` est actif, et
certaines erreurs de prérendu n'apparaissent qu'au build. Voir le piège
ci-dessous.

## L'administration

`/admin` exige un compte **admin** avec **double authentification** (HEP-62,
HEP-78), en local comme en production. Pour t'en créer un en local :

1. inscris-toi via l'API (`POST /api/auth/sign-up/email`) ou, plus tard, le
   formulaire client (HEP-63) ; sans clé Resend, le lien de confirmation
   s'affiche dans la console du serveur de dev ;
2. `bun run admin:promote <email>` ;
3. ouvre `/admin` : connexion, puis activation du TOTP sur `/admin/securite`.

La règle d'accès vit dans `src/server/admin-guard.ts` et s'applique trois
fois : dans `src/proxy.ts` (chaque requête), dans le layout du back-office,
et en tête de **chaque** Server Action (`requireAdminAction()`). Un client
connecté reçoit un **404**, pas un 403, qui confirmerait que l'URL existe.

Une session admin dure 8 h au plus et se ferme après 30 min d'inactivité ;
elle est alors supprimée en base, pas seulement refusée.

Le mode d'emploi des pages est dans [`BACK-OFFICE.md`](./BACK-OFFICE.md).

## Le cron des réservations

`GET /api/cron/reservations` (HEP-48). Il est signé par `CRON_SECRET` et
**refuse de fonctionner en production** si le secret est absent : sans lui,
n'importe qui pourrait le déclencher en boucle et vider le panier de clients en
cours d'achat. En local, la route répond sans secret.

**Un cron Vercel l'appelle une fois par jour**, à 4 h — et pas davantage, pour
la raison exposée au quatrième piège ci-dessous.

Le quotidien suffit, et ce n'est pas un pis-aller. Contrairement à ce que son
nom suggère, cette route **ne libère aucun stock** : la disponibilité se calcule
avec `reservedUntil > NOW()`, donc une réservation échue cesse de bloquer à la
seconde près, sans que rien ne tourne. La route ne fait que tenir l'historique —
poser le mouvement `RELEASE` en face du `RESERVE`. Un journal d'audit n'a pas
besoin d'être écrit à la minute.

Les crons ne s'exécutent que sur les déploiements de **production** ; en preview
la route existe mais rien ne la déclenche.

## Les pièges du projet

Quatre choses coûtent des heures quand on ne les sait pas.

### `cacheComponents` et le layout racine

Le **layout racine ne doit rien attendre**. S'il `await` quoi que ce soit,
toutes les routes dynamiques cassent au build. Les données du chrome passent
par un slot serveur déjà suspendu (`search-overlay-data.tsx`).

Même règle pour un segment dynamique : il lui faut un `generateStaticParams`,
sinon même échec.

Et le message d'erreur **ment** : il désigne toujours `site-chrome.tsx`. Pour
la vraie ligne :

```bash
bunx next build --debug-prerender
```

### Deux appels concurrents ne prouvent rien

Le test « 2 commandes en parallèle » ne détecte **pas** la survente : les deux
appels se sérialisent presque toujours. Il en faut une vingtaine. La même
leçon vaut pour la numérotation de commande et l'idempotence — les tests de ce
dépôt en lancent 25.

### `meta.target` n'existe pas sur une erreur P2002

Avec un driver adapter (`@prisma/adapter-pg`, `@prisma/adapter-neon`), la forme
documentée de l'erreur de contrainte unique **est absente**. Le champ fautif
vit sous `meta.driverAdapterError.cause.constraint.fields`, entre guillemets.
Détecter un conflit en lisant `meta.target` échoue silencieusement — voir
`isUniqueViolation` dans `src/server/services/orders.ts`.

### Un cron trop fréquent fait échouer le déploiement

Sur le plan **Hobby**, un cron Vercel ne peut tourner qu'**une fois par jour**.
Une expression plus fréquente ne dégrade pas le cron : elle fait échouer le
**déploiement entier**, avec « Hobby accounts are limited to daily cron jobs ».

Le `*/5 * * * *` déclaré en HEP-48 a bloqué **quatorze commits d'affilée** sans
que personne ne le voie — rien ne le signale à part une croix sur le commit et
un site de production qui cesse discrètement de suivre `main`.

Le cron est aujourd'hui déclaré en `0 4 * * *`, ce que Hobby accepte. Avant de
resserrer cette cadence, vérifier le plan du compte. Et après un merge, vérifier
que le déploiement est bien parti :

```bash
gh api repos/Ykolo/hephaistos/commits/main/status --jq '.state'
```

## Structure

```
src/
  app/            routes (App Router) — public, /admin, /api/cron
  components/     UI
  lib/            utilitaires client, validation Zod partagée
  server/
    actions/      Server Actions — lisent cookies et session
    services/     logique métier PURE — voir services/README.md
    db.ts         client Prisma + adapter
    errors.ts     ActionError et contrat d'erreur unique
prisma/
  schema.prisma   modèle complet, posé en une fois
  seed.ts
tests/            Vitest, base jetable
docs/
```

La règle qui structure tout : **un service est pur**. Il reçoit le client
Prisma en premier argument et ne lit jamais de cookie, de header ni de session.
Lire la session est le travail de la Server Action appelante. Le détail est
dans `src/server/services/README.md`.

## Les services tiers en local

Toutes leurs clés peuvent rester vides en local :

- **Resend** : sans clé, les emails s'affichent dans la console ;
- **Upstash** : sans clé, les quotas tombent sur un repli en mémoire ;
- **Sentry** : sans DSN, rien n'est envoyé ;
- **Stripe** : seul le lien vers le paiement de la fiche commande l'utilise
  aujourd'hui ; le tunnel de paiement arrive avec HEP-58 ;
- **Sendcloud** : aucun code ne l'appelle encore (HEP-69).
