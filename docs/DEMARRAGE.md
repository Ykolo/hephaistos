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

Pour démarrer, seules trois clés comptent :

```bash
DATABASE_URL="postgresql://hep:hep@localhost:55432/hephaistos"
DIRECT_URL="postgresql://hep:hep@localhost:55432/hephaistos"
ADMIN_UNSAFE_LOCAL="1"   # débloque /admin en local — voir plus bas
```

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

## Les tests

```bash
bun run test           # toute la suite
bun run test:watch     # en continu
bun run test tests/pricing.test.ts    # un fichier
```

Les tests écrivent et suppriment des données. Deux protections :

1. ils lisent `DIRECT_URL` ?? `DATABASE_URL`, et **refusent de démarrer** si
   l'URL pointe vers Neon ;
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

`/admin` n'a **pas encore d'authentification** (Better Auth = HEP-62, garde et
2FA = HEP-78). En attendant, elle est verrouillée par un double garde-fou dans
`src/server/admin-guard.ts` :

- bloquée dès que `NODE_ENV === "production"` ;
- et, même en développement, il faut poser `ADMIN_UNSAFE_LOCAL="1"`.

Sans les deux, `/admin` renvoie un **404** — pas un 403, qui confirmerait à un
visiteur que l'URL existe et vaut la peine d'être creusée.

**Ne jamais définir `ADMIN_UNSAFE_LOCAL` en préproduction ni en production.**

Pages disponibles : `/admin/produits`, `/admin/produits/[slug]`, `/admin/lots`,
`/admin/rappel`. Leur mode d'emploi est dans
[`BACK-OFFICE.md`](./BACK-OFFICE.md).

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

## Ce qui n'est pas encore branché

Stripe, Resend, Sendcloud, Better Auth, Upstash et Sentry ont leurs clés dans
`.env.example` mais **aucun code ne les appelle encore**. Les laisser vides
n'empêche rien de tourner.
