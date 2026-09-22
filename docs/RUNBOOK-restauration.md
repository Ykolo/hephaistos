# Runbook — restaurer la base

Pour une erreur de **code**, voir d'abord
[`RUNBOOK-deploiement.md`](./RUNBOOK-deploiement.md) : un rollback Vercel suffit
presque toujours, et il ne touche pas aux données.

Ce document sert quand les **données** sont atteintes : migration qui a
supprimé une colonne, `UPDATE` sans `WHERE`, suppression par erreur depuis
l'admin.

## Qui prévenir, dans quel ordre

1. **Couper les écritures** si l'erreur continue de se propager : désactiver le
   paiement (mode maintenance) plutôt que laisser entrer des commandes qu'on
   va écraser.
2. Prévenir **Jules** : une restauration efface tout ce qui a été écrit après
   l'instant choisi, commandes comprises.
3. Noter l'**heure exacte** de l'incident (UTC). Tout le reste en dépend.

## Les trois filets, du plus fin au plus grossier

| Filet                         | Profondeur               | Granularité      | Durée mesurée |
| ----------------------------- | ------------------------ | ---------------- | ------------- |
| Point-in-time Neon            | **6 h** (plafond du plan gratuit) | à la seconde | à mesurer (voir plus bas) |
| Snapshot Neon                 | 1 seul sur le plan gratuit | l'instant du snapshot | **~30 s** (mesuré le 22/09/2026) |
| Export quotidien GitHub       | 30 jours                 | 1 par jour, 3 h 17 UTC | à mesurer (voir plus bas) |

⚠️ **6 heures, c'est court.** Une erreur du vendredi soir n'est plus
rattrapable au point-in-time le lundi matin ; il ne reste que l'export de la
nuit, donc jusqu'à 24 h de commandes perdues. Le plan Neon payant (~19 €/mois)
porte la fenêtre à 7 jours puis 30. C'est une décision de coût à prendre
**avant** la mise en vente.

## A. Point-in-time — l'incident a moins de 6 h

On restaure la branche `production` **sur elle-même**, à un instant donné.
Neon conserve l'état actuel sous un autre nom : rien n'est détruit, on peut
revenir en arrière.

Console Neon → projet **Hephaistos Boutique** → **Restore** → branche
`production` → *From history* → date et heure **juste avant** l'incident
(ex. « 10 minutes avant la migration ratée ») → cocher la conservation de
l'état actuel → **Restore**.

En ligne de commande :

```bash
neonctl branches restore production ^self@2026-09-22T08:00:00Z \
  --preserve-under-name production-avant-restauration \
  --project-id blue-sun-67770852
```

Les connexions de Vercel pointent sur l'**endpoint**, qui suit la branche :
aucune variable d'environnement à changer.

Puis :

1. Vérifier sur le site (admin → commandes, catalogue) que l'état est le bon.
2. Rejouer à la main ce qui a été légitimement écrit **après** l'instant
   choisi et **avant** l'incident découvert — commandes payées : les
   retrouver dans le dashboard Stripe.
3. Garder `production-avant-restauration` au moins 7 jours, puis la
   supprimer.

## B. Snapshot — l'incident a plus de 6 h, un snapshot est plus récent que l'export

Console Neon → **Backup & Restore** → **Snapshots** → le snapshot → **Restore**.

⚠️ Piège constaté lors du test du 22/09/2026 : la restauration d'un snapshot
se **finalise par défaut sur la branche d'origine**. La branche restaurée
prend le nom `production` et récupère son endpoint ; l'ancienne est renommée
(`… (1)`). C'est ce qu'on veut en cas d'incident — c'est **exactement ce qu'on
ne veut pas** pour un simple test. Pour tester, restaurer avec
`finalize: false`, ou sur une branche existante jetable.

Le plan gratuit n'autorise qu'**un** snapshot : il faut supprimer l'ancien
avant d'en prendre un nouveau. Bon usage : un snapshot manuel juste avant
chaque migration risquée.

## C. Export quotidien — l'incident a plus de 6 h

1. GitHub → **Actions** → workflow **Sauvegarde** → le run de la nuit
   précédant l'incident → télécharger l'artefact `hephaistos-<date>`.
2. Déchiffrer (phrase dans le gestionnaire de mots de passe) :

   ```bash
   gpg --decrypt hephaistos-2026-09-22T0317Z.dump.gpg > hephaistos.dump
   ```

3. Créer une branche Neon **vide** de restauration (console → Branches →
   New branch → *Schema only* ou nouvelle base), récupérer sa chaîne
   **directe**.
4. Restaurer :

   ```bash
   pg_restore --no-owner --no-acl --exit-on-error \
     --dbname="postgresql://…@ep-xxx.eu-central-1.aws.neon.tech/hephaistos?sslmode=require" \
     hephaistos.dump
   ```

5. Vérifier, puis basculer : console Neon → la branche restaurée → **Set as
   default**, et déplacer l'endpoint de production dessus (ou mettre à jour
   `DATABASE_URL` / `DIRECT_URL` dans Vercel et redéployer).
6. Supprimer `hephaistos.dump` du poste : il contient les données de tous les
   clients, en clair.

## Tester ce runbook

La definition of done de HEP-36 exige qu'une personne **autre que l'auteur**
suive ce document sans aide. À faire sur une branche jetable :

1. Créer une branche `restauration-test` depuis `production`.
2. Y noter l'heure, puis détruire des données
   (`DELETE FROM "Product" WHERE slug = 'serum';`).
3. La restaurer à l'heure notée (procédure A appliquée à `restauration-test`).
4. Vérifier que le produit est revenu ; chronométrer ; reporter la durée
   dans le tableau ci-dessus.
5. Même exercice avec un export (procédure C) sur une branche vide.
6. Supprimer la branche.
