# Runbook — déployer, migrer, revenir en arrière

À lire **avant** d'écrire une migration, pas après l'incident. Pour la
restauration de données, voir [`RUNBOOK-restauration.md`](./RUNBOOK-restauration.md).

## Le chemin normal

1. Une PR ouvre une **preview** Vercel (protégée par Vercel Authentication,
   `noindex`). La CI GitHub (`.github/workflows/ci.yml`) vérifie en parallèle :
   lint, types, migrations sur base vierge, tests, build.
2. `main` est protégée : pas de push direct, fusion uniquement si la CI est
   verte.
3. La fusion déclenche le déploiement de production. La commande de build
   Vercel (`vercel.ts`) est :

   ```
   bun run db:deploy && bun run build
   ```

   La base de production est migrée **avant** le build, et Vercel ne bascule
   le trafic qu'une fois le build terminé.

## Ce que chaque échec produit

| Échec                                   | Base          | Site servi              | Action                                                  |
| --------------------------------------- | ------------- | ----------------------- | ------------------------------------------------------- |
| Migration refusée                       | inchangée     | ancien déploiement      | corriger la migration, nouvelle PR                      |
| Build en échec **après** migration      | **migrée**    | ancien déploiement      | l'ancien code doit supporter le nouveau schéma — voir la règle |
| Bug découvert après mise en ligne       | migrée        | nouveau déploiement     | `vercel rollback` (code seulement)                      |

## La règle : toute migration reste compatible avec le code précédent

`vercel rollback` remet le **code** en arrière, **jamais la base**. Si une
migration supprime une colonne que l'ancien code lit, le rollback ramène un
code qui plante sur chaque requête : on a perdu à la fois la version neuve et
la possibilité de revenir.

Une migration destructive se fait donc en **deux déploiements** :

| Changement voulu        | Déploiement 1                                          | Déploiement 2 (une fois le 1 validé)  |
| ----------------------- | ------------------------------------------------------ | ------------------------------------- |
| Supprimer une colonne   | le code cesse de la lire et de l'écrire                | `DROP COLUMN`                         |
| Renommer une colonne    | ajout de la nouvelle, écriture dans les deux, recopie  | lecture sur la nouvelle, puis `DROP` de l'ancienne |
| Rendre un champ `NOT NULL` | le code remplit toujours le champ + recopie des anciennes lignes | `SET NOT NULL`                       |
| Changer un type         | nouvelle colonne typée + recopie                       | bascule puis suppression              |

Ce qui est **toujours sûr** en un seul déploiement : ajouter une table, ajouter
une colonne nullable ou avec valeur par défaut, ajouter un index
(`CREATE INDEX CONCURRENTLY` si la table est grosse).

En revue de PR : tout fichier `migration.sql` contenant `DROP`, `RENAME`,
`ALTER ... TYPE` ou `SET NOT NULL` doit pointer vers le déploiement 1 déjà en
production.

## Revenir en arrière

### Le code seulement

Dashboard Vercel → projet `hephaistos` → **Deployments** → le dernier
déploiement sain → **Instant Rollback**. Ou, en ligne de commande :

```bash
vercel rollback
```

Effet immédiat, sans rebuild. ⚠️ Tant qu'un rollback est actif, les
déploiements suivants **ne sont plus promus automatiquement** : il faut
promouvoir à la main le correctif (`vercel promote <url>`), sinon la
production reste figée sur l'ancienne version sans que rien ne le signale.

### La base

Si la règle ci-dessus a été tenue, on n'a jamais besoin de revenir sur la base
pour un rollback de code. Sinon, c'est une restauration de données :
[`RUNBOOK-restauration.md`](./RUNBOOK-restauration.md).

## Previews et bases

Chaque preview reçoit sa **propre branche Neon**, créée par l'intégration
Neon ↔ Vercel à partir de la branche `production`, et supprimée quand la
branche Git l'est. Ses migrations s'y appliquent sans toucher à personne.

`prisma.config.ts` lit `DATABASE_URL_UNPOOLED` en priorité : c'est la variable
que l'intégration pose par preview. Tant que l'intégration n'est pas installée,
toutes les previews partagent la branche `dev`.
