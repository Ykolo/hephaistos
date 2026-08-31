# Le back-office — mode d'emploi

Guide non technique de l'administration d'Héphaïstos.

> ## ⚠️ Le back-office n'est pas encore utilisable au quotidien
>
> Il n'a **pas d'écran de connexion**. Aujourd'hui il ne s'ouvre que sur
> l'ordinateur de développement, jamais depuis internet. Ce n'est pas un
> oubli : livrer un back-office sans mot de passe reviendrait à laisser
> n'importe qui changer les prix et le stock de la boutique.
>
> La connexion sécurisée (mot de passe + double authentification) est prévue,
> et c'est elle qui débloquera l'accès depuis le web.
>
> **Ce document décrit ce qui existe déjà.** Il grandira avec le
> back-office. Ce qui manque encore est listé à la fin.

---

## Ce que tu peux faire aujourd'hui

| Écran               | À quoi il sert                                     |
| ------------------- | -------------------------------------------------- |
| **Produits**        | Voir la liste, ouvrir une fiche                     |
| **Fiche produit**   | Tout modifier : prix, textes, photos, mise en vente |
| **Lots**            | Enregistrer une réception de marchandise            |
| **Rappel produit**  | Retrouver qui a reçu un lot donné                   |

---

## Les produits

### La liste

Elle montre les produits, leur prix, leur stock et leur état de publication.
Cliquer sur un produit ouvre sa fiche.

### La fiche produit

Tout se modifie ici, en une seule page.

**L'identité** — Nom, référence (SKU), adresse web (le « slug », ce qui apparaît
dans l'URL), accroche, description.

> ⚠️ **Changer l'adresse web casse les liens existants.** Un client qui avait
> mis la page en favori, ou un lien partagé sur les réseaux, ne trouvera plus
> rien. À ne faire qu'avant la mise en ligne.

**Les prix** — Le prix affiché, en euros TTC. **La TVA est déjà dedans** : c'est
la règle pour la vente aux particuliers en France. Le prix que tu saisis est
exactement celui que le client paie.

Le « prix barré » est prévu pour les promotions — l'ancien prix, montré rayé à
côté du nouveau. Le champ est enregistré, mais **la boutique ne l'affiche pas
encore** : le remplir n'a aujourd'hui aucun effet visible.

Le volume en millilitres sert à afficher le prix aux 100 ml, obligatoire en
cosmétique.

**Le poids en grammes n'est pas décoratif** : c'est lui qui déterminera le tarif
d'expédition. Un poids faux, ce sont des frais de port faux.

**La mise en vente** — deux réglages qu'il ne faut pas confondre :

- **Statut** : *brouillon* (invisible du public), *publié* (visible),
  *archivé* (retiré). Un brouillon n'est visible de personne, même avec le lien
  direct.
- **Disponibilité** : *bientôt disponible*, *en stock*, *précommande*,
  *arrêté*. Elle décide de ce que fait le bouton d'achat.

Un produit *publié* mais *bientôt disponible* s'affiche sur la boutique avec un
bouton grisé — c'est le cas des trois soins aujourd'hui.

**La précommande** — Vendre avant d'avoir la marchandise. Une **date d'envoi est
obligatoire**, et elle est annoncée au client **avant** qu'il paie.

> ⚠️ Encaisser tout de suite crée l'obligation de livrer à la date annoncée.
> Au-delà de 30 jours de retard sans nouvelle date acceptée, le client peut
> exiger d'être remboursé. Si la date bouge, il faut prévenir tous ceux qui ont
> précommandé — ce n'est pas du confort, c'est la loi.

**Les mentions cosmétiques** — Mode d'emploi, liste INCI des ingrédients,
précautions.

**Le référencement** — Titre et description qui apparaissent dans Google. Laissés
vides, ils sont déduits du nom et de la description.

### Les photos

Glisser-déposer sur la fiche. **Le texte alternatif est obligatoire** : c'est ce
que lisent les personnes malvoyantes, et ce que Google indexe.

Les images sont converties et redimensionnées automatiquement. Inutile de les
préparer avant.

### Le coffret

Le coffret est un produit particulier : il **ne possède pas de stock à lui**.
Son stock est calculé à partir de ses composants — s'il te reste 12 nettoyants,
8 sérums et 3 crèmes, tu peux vendre **3 coffrets**, pas un de plus.

Vendre un coffret retire donc une unité de chaque composant. Inutile — et
impossible — de saisir un stock sur le coffret : renseigner sa composition
suffit.

---

## Les lots

Chaque réception de marchandise s'enregistre ici : **produit**, **numéro de
lot**, **quantité reçue** et **date limite** (optionnelle).

C'est ce qui ajoute du stock. Deux raisons de ne pas s'en passer :

1. c'est une **obligation réglementaire** en cosmétique ;
2. c'est ce qui rend un rappel produit possible.

Sans numéro de lot, un rappel oblige à contacter *tous* les clients au lieu des
seuls concernés.

---

## Le rappel produit

Le jour où un lot pose problème : saisir le numéro de lot, l'écran liste **les
commandes concernées et les clients à prévenir**, avec un export en tableur.

C'est l'écran qu'on espère ne jamais ouvrir, et celui qu'il vaut mieux avoir
déjà vu une fois.

---

## Comment marche le stock

Trois choses à savoir, elles expliquent tout le reste.

**Le stock est retiré au paiement, pas à la mise au panier.** Tant que le client
n'a pas payé, rien n'est décompté.

**Mais un panier réserve.** Ajouter un produit à son panier le met de côté
pendant **30 minutes**. Pendant ce temps il n'est plus proposé aux autres. Le
délai passé, la réservation tombe toute seule et le produit redevient
disponible.

C'est pour ça que le stock affiché en administration peut différer de ce que la
boutique propose : la différence, ce sont les paniers en cours.

**Rien ne modifie le stock sans laisser de trace.** Chaque mouvement — vente,
réception, annulation, correction — est enregistré avec sa date et sa raison.
Le jour où un chiffre semble faux, l'historique dit pourquoi.

Une **alerte de stock bas** se déclenche au passage sous le seuil défini sur la
fiche produit. Une fois par franchissement, pas à chaque commande.

---

## Les commandes

L'écran de gestion des commandes **n'existe pas encore**. Le moteur, lui, est
en place et testé : voici comment il se comportera.

### Les étapes d'une commande

```
en attente → payée → en préparation → expédiée → livrée
```

À tout moment avant l'expédition, une commande peut être **annulée**. Après
paiement, elle peut être **remboursée**, en totalité ou en partie.

**Une commande expédiée ne s'annule plus** : le colis est parti. Elle passe par
une demande de retour — et là, c'est toi qui décides si le produit revient en
stock ou part au rebut. Pour un cosmétique ouvert, la réponse est le rebut.

### L'annulation

Trois choses arrivent en même temps, et **soit les trois réussissent, soit
aucune** : le client est remboursé, le stock revient, la commande change
d'état. Si le remboursement échoue, rien n'est annulé — pas de commande
disparue avec un client débité.

Un **motif est obligatoire**. Il est conservé et sert à écrire le mail
d'annulation.

Le code promo utilisé est **rendu au client**. Perdre son code parce que la
boutique a annulé, c'est un mail au service client.

### Le double clic sur « payer »

Il ne crée qu'une commande. C'est garanti dans la base de données, pas
seulement par un bouton grisé — un bouton grisé ne protège pas d'un
rechargement de page ni d'une connexion qui rejoue la requête.

### Les mails

Chaque changement d'état déclenche **exactement un mail, jamais deux**. La mise
en préparation n'en envoie aucun : c'est une étape interne, prévenir le client
n'apporte rien et use sa boîte mail.

---

## Ce qui manque encore

- **La connexion sécurisée** — mot de passe, double authentification, journal
  d'activité. C'est ce qui débloquera l'accès depuis internet.
- **L'écran des commandes** — liste, recherche, fiche détail, bouton d'annulation.
- **Le paiement** — le compte Stripe doit être ouvert (dossier société, réseau
  Cartes Bancaires).
- **Les mails** — le moteur sait *quel* mail envoyer, mais rien n'est encore
  expédié.
- **L'expédition** — étiquettes, numéros de suivi, grille tarifaire.
- **Le tableau de bord** — ventes, alertes de stock, commandes à expédier.
- **Les codes promo**, les **factures PDF**, les **exports comptables**.

---

## Ce qui t'attend, toi

Quelques décisions ne peuvent venir que de la marque :

- **Le poids et le volume réels de chaque produit.** Ils sont provisoires en
  base, et ils bloquent le calcul des frais de port.
- **Le seuil de livraison offerte** et la grille tarifaire.
- **Les mentions légales réelles** : SIRET, capital, TVA intracommunautaire,
  directeur de publication. Le site annonce aujourd'hui être propulsé par
  Shopify — c'est **faux** et ça doit disparaître avant la mise en ligne.
- **L'adresse du site** : avec ou sans `www`.
