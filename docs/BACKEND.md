# Plan backend — Héphaïstos

Document de référence pour la construction du backend. Cible : transformer le
front actuel (catalogue en dur, formulaires simulés, panier placeholder) en
boutique en ligne complète, pilotable par la marque.

Les 10 epics Linear **HEP-22 → HEP-31** décrivent le besoin côté métier. Ce
document décrit le **comment** côté dev, et sert de source aux sous-issues.

---

## 1. Décisions actées

| Sujet | Choix | Note |
| --- | --- | --- |
| Architecture | Backend **dans** l'app Next.js (App Router, Vercel Functions, Node 24, Fluid Compute) | Pas de service séparé tant qu'il n'y a pas de second client |
| Région | `cdg1` / `fra1` + Neon `eu-central` | Marque française, données personnelles, RGPD |
| Base | **Neon Postgres** (Vercel Marketplace) | Branching par preview = l'env de test de HEP-22 |
| ORM | **Prisma** + Prisma Migrate | Driver adapter Neon obligatoire (cf. §2) |
| Auth clients + admin | **Better Auth** | Self-hosted dans le même Postgres, TOTP admin, données UE |
| Paiement | **Stripe Checkout hébergé** | SCA/3DS, Apple Pay, Google Pay, PayPal, PCI SAQ-A |
| Emails transactionnels | **Resend** (+ React Email) | Les 9 mails de HEP-27 |
| Marketing / segmentation | **Brevo** | Sync sortante uniquement — Brevo n'envoie aucun mail de commande |
| Livraison | **Sendcloud** (Colissimo + Mondial Relay) | Sélecteur de point relais côté site |
| Fichiers | **Vercel Blob** | Remplace la dépendance au CDN Shopify actuel |
| Cache / rate limit | **Upstash Redis** + `@upstash/ratelimit` | |
| Validation | **Zod** | Schémas partagés client/serveur, messages en français |
| Anti-bot | **Vercel BotID** + honeypot | Formulaires publics |
| Erreurs | **Sentry** | Alerte prioritaire sur webhook Stripe en échec |
| Consentement | **Bannière maison** (CNIL) | Obligatoire dès qu'on charge GA4 ou Meta. Refus en un clic, preuve conservée |
| Mesure d'audience | **GA4** + Consent Mode v2 | Les 4 signaux, `denied` par défaut |
| Conversions publicitaires | **Meta CAPI** (serveur) + pixel | L'achat part du webhook Stripe, dédupliqué avec le pixel par `event_id` |

**Shopify et Klaviyo sont abandonnés.** Les issues HEP-14 (webhooks Shopify) et
HEP-15 (Klaviyo) sont caduques, ainsi que la mention « Hébergement : Shopify Inc. »
dans `legalContent`.

> Les briques externes se provisionnent via `vercel integration add <nom>`, pas
> par un `bun add <sdk>` manuel : c'est ce qui injecte les variables
> d'environnement et unifie la facturation.

---

## 2. Architecture

```
src/
  server/
    db.ts                 client Prisma (singleton + adapter Neon)
    auth.ts               config Better Auth + gardes (requireUser, requireAdmin)
    ratelimit.ts          instances Upstash
    services/             logique métier pure et testable
      catalog.ts  stock.ts  cart.ts  pricing.ts  orders.ts
      checkout.ts  shipping.ts  discounts.ts  invoices.ts
    actions/              Server Actions (mutations depuis les formulaires)
    email/                templates React Email + client Resend
  app/
    api/
      auth/[...all]/route.ts        Better Auth
      stripe/webhook/route.ts       source de vérité du paiement
      sendcloud/webhook/route.ts    statuts de colis
      cron/{reservations,pending}/route.ts
    admin/                back-office (layout protégé + noindex)
    compte/               espace client
  lib/
    validation/           schémas Zod partagés
prisma/
  schema.prisma
  migrations/
  seed.ts
```

### Client Prisma sur Neon

Prisma en serverless doit passer par le driver adapter, sinon chaque invocation
ouvre une connexion TCP et Neon sature.

Implémenté dans `src/server/db.ts`. `DATABASE_URL` = chaîne **poolée** Neon ;
`DIRECT_URL` = chaîne directe, pour les migrations.

> **Corrigé à l'implémentation (HEP-33).** Ce document décrivait Prisma 6.
> En **Prisma 7** :
>
> - `previewFeatures = ["driverAdapters"]` n'existe plus — les driver adapters
>   sont le fonctionnement normal, le déclarer fait échouer la validation ;
> - `datasource` n'accepte plus `url` ni `directUrl` dans `schema.prisma`. Les
>   chaînes vivent dans **`prisma.config.ts`** (clé `datasource.url`, alimentée
>   par `DIRECT_URL`) pour Migrate, et dans l'adapter du client pour le runtime ;
> - le generator est `prisma-client` (et non `prisma-client-js`), avec `output`
>   obligatoire — d'où `src/generated/prisma`, ignoré par git et régénéré au build.
>
> `src/server/db.ts` choisit son adapter selon l'hôte : Neon en preview et
> production, `@prisma/adapter-pg` sur un Postgres classique. Sans ce second
> cas, aucune base jetable ne peut recevoir les migrations, donc rien n'est
> testable hors ligne (HEP-83).

### Règles transverses

1. **Server Action** pour toute mutation déclenchée par un formulaire.
   **Route Handler** pour ce qui vient de l'extérieur : webhooks, liens de
   confirmation, crons.
2. **Prix en centimes** (`Int`) + devise. Le front stocke aujourd'hui
   `price: "15"` (string) : à migrer, sinon les arrondis feront mal au checkout.
3. Toute entrée est **validée par Zod à la frontière serveur**, jamais seulement
   côté client.
4. **Aucun montant ne vient du client.** Le panier transporte des
   `(productId, qty)` ; le serveur recalcule tout depuis la base.
5. Retour uniforme des actions : `{ ok: true, data }` ou `{ ok: false, code, message }`.
6. Jamais de `NEXT_PUBLIC_` sur une clé serveur. `vercel env pull` en local.
7. Migrations versionnées dans git, `prisma migrate deploy` en CI avant le déploiement.

---

## 3. Modèle de données

Schéma cible complet. Il est volontairement posé **en une seule fois** en phase 0 :
ajouter `country` / `currency` / `lot` sur une base déjà pleine de commandes est
un chantier, comme le note HEP-22.

```prisma
// --- Catalogue -----------------------------------------------------------
model Product {
  id            String   @id @default(uuid())
  slug          String   @unique              // 'nettoyant', 'serum', 'creme'
  sku           String   @unique              // HEP-NET-001-100
  name          String
  tagline       String?
  description   String
  category      Category
  kind          ProductKind @default(SIMPLE)  // SIMPLE | BUNDLE (le coffret)
  priceCents    Int
  compareAtCents Int?
  currency      String   @default("EUR")
  volumeMl      Int?                          // pour le prix aux 100 ml
  weightGrams   Int                           // indispensable au tarif Sendcloud
  status        ProductStatus @default(DRAFT) // DRAFT | PUBLISHED | ARCHIVED
  availability  Availability  @default(COMING_SOON)
  preorderShipsAt DateTime?                   // affiché AVANT paiement
  stock         Int      @default(0)
  lowStockAlert Int      @default(5)
  usage         String?
  inci          String?
  precautions   String?
  seoTitle      String?
  seoDescription String?
  position      Int      @default(0)
  benefits      ProductBenefit[]
  images        ProductImage[]
  components    BundleComponent[] @relation("BundleParent")
  partOf        BundleComponent[] @relation("BundleChild")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model BundleComponent {          // le coffret décrémente les 3 références
  bundle    Product @relation("BundleParent", fields: [bundleId], references: [id])
  bundleId  String
  component Product @relation("BundleChild", fields: [componentId], references: [id])
  componentId String
  qty       Int     @default(1)
  @@id([bundleId, componentId])
}

model ProductBenefit { id String @id @default(uuid()) productId String label String position Int }
model ProductImage   { id String @id @default(uuid()) productId String blobUrl String alt String role ImageRole position Int }

model StockMovement {            // historique : qui a modifié quoi, quand
  id        String   @id @default(uuid())
  productId String
  delta     Int
  reason    StockReason          // SALE | RESTOCK | CANCEL | REFUND | MANUAL | RESERVE | RELEASE
  orderId   String?
  actorId   String?
  note      String?
  createdAt DateTime @default(now())
}

model Batch {                    // numéro de lot — obligation cosmétique (rappel produit)
  id        String   @id @default(uuid())
  productId String
  code      String
  expiresAt DateTime?
  quantity  Int
  createdAt DateTime @default(now())
  @@unique([productId, code])
}

// --- Panier --------------------------------------------------------------
model Cart {
  id        String   @id @default(uuid())
  token     String   @unique      // cookie httpOnly, panier invité
  userId    String?
  items     CartItem[]
  discountCode String?
  expiresAt DateTime              // libère les réservations
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model CartItem { id String @id @default(uuid()) cartId String productId String qty Int reservedUntil DateTime? }

// --- Commandes -----------------------------------------------------------
model Order {
  id            String @id @default(uuid())
  number        String @unique          // HF-2026-0001, non devinable de l'extérieur
  publicToken   String @unique          // suivi sans compte
  userId        String?
  email         String
  status        OrderStatus @default(PENDING)
  subtotalCents Int
  discountCents Int @default(0)
  shippingCents Int
  taxCents      Int
  totalCents    Int
  currency      String @default("EUR")
  country       String @default("FR")
  vatRate       Int    @default(2000)   // points de base : 20,00 %
  stripeSessionId       String? @unique
  stripePaymentIntentId String? @unique
  idempotencyKey        String? @unique // anti double-clic
  shippingAddress Json
  billingAddress  Json
  discountCode  String?
  internalNote  String?
  isPreorder    Boolean @default(false)
  preorderShipsAt DateTime?
  items         OrderItem[]
  events        OrderEvent[]
  shipments     Shipment[]
  invoice       Invoice?
  createdAt DateTime @default(now())
  paidAt    DateTime?
  shippedAt DateTime?
}

model OrderItem {                 // snapshot obligatoire : un prix qui change
  id        String @id @default(uuid())  // demain ne doit pas modifier
  orderId   String                       // les anciennes commandes
  productId String?
  nameSnapshot   String
  skuSnapshot    String
  priceCentsSnapshot Int
  qty       Int
  batchCode String?
}

model OrderEvent { id String @id @default(uuid()) orderId String from String? to String actorId String? note String? createdAt DateTime @default(now()) }

model Invoice {                   // numérotation continue et sans trou (obligation FR)
  id        String @id @default(uuid())
  orderId   String @unique
  number    String @unique        // FA-2026-000001, cf. next_invoice_number()
  blobUrl   String?
  totalCents Int
  vatCents  Int
  issuedAt  DateTime @default(now())
}

model StripeEvent { id String @id  type String  processedAt DateTime @default(now()) } // idempotence

// --- Livraison -----------------------------------------------------------
model Shipment {
  id        String @id @default(uuid())
  orderId   String
  carrier   String                // colissimo | mondial_relay
  method    ShippingMethod        // HOME | PICKUP_POINT
  pickupPointId   String?
  pickupPointData Json?
  sendcloudParcelId String?
  trackingNumber  String?
  trackingUrl     String?
  labelUrl        String?
  status    String?
  shippedAt DateTime?
  deliveredAt DateTime?
}

model ShippingRate { id String @id @default(uuid()) carrier String method ShippingMethod maxWeightGrams Int priceCents Int freeAboveCents Int? active Boolean @default(true) }

model ReturnRequest { id String @id @default(uuid()) orderId String reason String status ReturnStatus refundCents Int? createdAt DateTime @default(now()) }

// --- Réductions ----------------------------------------------------------
model Discount {
  id        String @id @default(uuid())
  code      String @unique
  type      DiscountType          // FIXED | PERCENT | FREE_SHIPPING
  value     Int                   // centimes ou points de base
  minOrderCents Int?
  productId String?               // null = tout le panier
  startsAt  DateTime?
  endsAt    DateTime?
  maxUses   Int?
  maxUsesPerCustomer Int @default(1)
  usedCount Int @default(0)
  stripePromotionCodeId String?
  active    Boolean @default(true)
}

model DiscountRedemption { id String @id @default(uuid()) discountId String orderId String email String createdAt DateTime @default(now()) }

// --- Clients, contenu, ops -----------------------------------------------
// user / session / account / verification : générés par Better Auth
model Address { id String @id @default(uuid()) userId String label String? firstName String lastName String line1 String line2 String? postalCode String city String country String @default("FR") phone String? isDefault Boolean @default(false) }

model Subscriber {                // preuve du consentement (obligation)
  id String @id @default(uuid())
  email String @unique
  status SubscriberStatus @default(PENDING)
  source String?                  // 'band' | 'hero' | 'produit' | 'checkout'
  consentAt DateTime?
  confirmedAt DateTime?
  confirmToken String? @unique
  unsubToken   String  @unique
  tokenExpiresAt DateTime?
  ipHash String?                  // SHA-256 salé, jamais l'IP brute
  userAgent String?
  brevoSyncedAt DateTime?
  createdAt DateTime @default(now())
}

model Message      { id String @id @default(uuid()) firstName String lastName String email String subject String body String status MessageStatus @default(NEW) ipHash String? createdAt DateTime @default(now()) }
model Review       { id String @id @default(uuid()) productId String? authorName String email String rating Int title String? body String status ReviewStatus @default(PENDING) verifiedPurchase Boolean @default(false) orderId String? adminNote String? createdAt DateTime @default(now()) publishedAt DateTime? }
model ContentBlock { key String @id  title String?  bodyMd String  updatedAt DateTime @updatedAt  updatedBy String? }  // 'legal.cgv', 'histoire.intro', …
model CompanySettings { id String @id @default("singleton") legalName String address Json siret String vatNumber String contactEmail String contactPhone String? vatRate Int @default(2000) shipsTo String[] @default(["FR"]) }
model AuditLog    { id String @id @default(uuid()) actorId String? entity String entityId String action String diff Json? createdAt DateTime @default(now()) }
```

---

## 4. Les trois invariants critiques

HEP-31 les nomme comme « les 3 pièges ». Ce sont les seuls endroits où une
erreur coûte de l'argent réel. Ils se règlent par la conception, pas par les tests.

### 4.1 Le dernier flacon vendu deux fois

Ne **jamais** faire `SELECT stock` puis `UPDATE stock = stock - qty` : entre les
deux, un autre client passe. Décrément atomique conditionnel, dans la même
transaction que la création de commande :

```sql
UPDATE "Product" SET stock = stock - $qty
WHERE id = $id AND stock >= $qty
RETURNING stock;
-- 0 ligne retournée = rupture, on annule toute la transaction
```

Pour le coffret : décrémenter les composants dans un **ordre stable** (tri par
`componentId`) pour éviter les interblocages entre deux commandes concurrentes.

> Implémenté en HEP-33 comme fonction Postgres `decrement_stock(id, qty)`,
> qui renvoie le stock restant ou `NULL` en cas de rupture. Vérifié : sur
> 25 achats simultanés pour 10 unités, exactement 10 passent et le stock
> tombe à 0.

### 4.1 bis — La numérotation de factures

`docs` annonçait une **séquence Postgres**. Une séquence ne convient pas :
`nextval()` est non transactionnel, donc un rollback consomme le numéro et
laisse un **trou** dans la série — exactement ce que l'administration fiscale
interdit. La numérotation passe donc par la table `InvoiceCounter` et la
fonction `next_invoice_number(year)`, incrémentée dans la même transaction que
la facture : si la transaction échoue, le numéro est rendu. Vérifié par un
rollback volontaire, qui ne consomme aucun numéro.

### 4.2 Le double débit

Une clé d'idempotence générée **côté serveur** au rendu de la page panier,
stockée dans `Order.idempotencyKey` avec contrainte unique, et transmise à
Stripe en `Idempotency-Key`. Deuxième clic → conflit d'unicité → on renvoie la
session existante au lieu d'en créer une seconde. Le bouton désactivé côté
client n'est qu'un confort, pas une garantie.

### 4.3 Le paiement validé mais la commande perdue

**Seul `POST /api/stripe/webhook` fait foi.** La page de retour navigateur ne
crée jamais rien : elle lit une commande, ou affiche « paiement en cours de
confirmation » et rafraîchit.

Le webhook : corps brut (pas de parsing Next), vérification de signature,
insertion dans `StripeEvent` avant traitement (idempotence), puis transaction
unique — commande payée, stock décrémenté, facture numérotée, mails envoyés.
Alerte Sentry sur tout échec : c'est là qu'on perd de l'argent silencieusement.

---

## 5. Séquence

| Lot | Epic | Contenu | Charge | Bloque |
| --- | --- | --- | --- | --- |
| 1 | HEP-22 | Fondations : Neon, Prisma, schéma, CI, sauvegardes, observabilité | 3–4 j | tout |
| 2 | HEP-23 | Produits, SKU, coffret, stock, précommande, images, lots | 4–5 j | 3, 4 |
| 3 | HEP-24 | Panier serveur, réservations, moteur de prix | 3–4 j | 4 |
| 4 | HEP-25 | Commandes, états, snapshot, idempotence | 3–4 j | 5 |
| 5 | HEP-26 | Stripe Checkout, webhook, remboursements, factures | 4–5 j | mise en vente |
| 6 | HEP-27 | Better Auth, espace client, Resend, 9 mails | 4–5 j | — |
| 7 | HEP-28 | Sendcloud, point relais, étiquettes, suivi, retours | 3–4 j | — |
| 8 | HEP-29 | Fiches clients, codes promo, promos produit, Brevo | 3–4 j | — |
| 9 | HEP-30 | Back-office : accès 2FA, tableau de bord, réglages, pages légales | 5–6 j | — |
| 10 | HEP-31 | Tests des 3 pièges, e2e, audit externe, go-live | 4–5 j | mise en ligne |
| 11 | HEP-88 | Contact et avis clients (ajout au cadrage) | 1,5–2,5 j | — |
| 12 | HEP-91 | Consentement CNIL, GA4 Consent Mode v2, Meta CAPI serveur | 2,5–3,5 j | mise en ligne |
| 13 | HEP-92 | SEO technique : sitemap, robots, metadata, JSON-LD | 1,5–2 j | — |

**Total : 42–54,5 jours.** Ordre : 1 → 2 → 3 → 4 → 5 est la chaîne critique ; 6, 7,
8 se parallélisent une fois le lot 4 posé ; 9 se construit au fil de l'eau (chaque
lot livre son écran d'admin) ; 10 est bloquant avant la première vente réelle.

Le lot 9 est découpé pour être livré par morceaux, pas en bloc à la fin : sinon
Jules n'a rien pour tester pendant deux mois. Le lot 11 est un ajout au cadrage
d'origine : le formulaire de contact et les avis existent déjà à l'écran sur le
site et ne fonctionnent pas.

Le **lot 12 n'est pas repoussable après le lot 5** : la mesure serveur des
conversions part du webhook Stripe, et les champs de consentement et
d'attribution (`consentMarketing`, `fbp`, `fbc`, `clientIp`, `clientUserAgent`)
doivent entrer dans la **même migration** que la table `Order`. Ajoutés après, ils
imposent de migrer une base de commandes déjà remplie et font perdre
définitivement les conversions des premières ventes — celles qui servent à
calibrer les campagnes de lancement.

Chaque lot est découpé en sous-issues Linear (HEP-32 → HEP-100), avec pour chacune
le travail, les pièges identifiés et une definition of done.

---

## 6. Ce qui reste à trancher

| Sujet | Qui | Impact si non tranché |
| --- | --- | --- |
| **Panier mixte** (disponible + précommande) : un colis à la date de précommande, ou deux colis ? | Jules | Bloque le lot 3. Recommandation : **un seul colis**, date annoncée avant paiement — deux colis = deux frais de port à absorber |
| Format SKU définitif et référentiel des lots | Anita | Bloque le schéma produits du lot 2 |
| Seuil de livraison offerte, grille poids/tarif | Jules | Bloque le lot 7 |
| Mentions légales réelles : SIRET, capital, TVA intracom, directeur de publication | Jules | Bloque la mise en ligne. `legalContent` annonce aujourd'hui Shopify : **faux** |
| ~~Bandeau cookies~~ **tranché** | Bannière obligatoire | GA4 + Meta rendent l'exemption impossible. Pour l'éviter, il faudrait renoncer aux deux et s'en tenir à Vercel Analytics — arbitrage acquisition contre simplicité, à confirmer par Jules (HEP-91) |
| Comptes clients : au lancement ou après ? | Jules | HEP-27 dit oui ; le checkout invité reste obligatoire dans les deux cas |

---

## 7. Backlog Linear à nettoyer

Le projet « Web » (HEP-7 → HEP-21) date d'un cadrage antérieur et double
maintenant HEP-22 → HEP-31, avec des choix contradictoires :

- **À annuler** : HEP-14 (Shopify), HEP-15 (Klaviyo) — décision inverse actée.
- **À fusionner** dans les lots ci-dessus : HEP-7, HEP-8, HEP-9 → lot 1 ;
  HEP-10, HEP-11 → lot 6 ; HEP-12 → lot 2 ; HEP-13 → lots 3 et 4 ;
  HEP-16 → lot 6 ; HEP-17, HEP-20 → lots 1 et 10 ; HEP-18, HEP-19 → lots 1 et 10.
- **À garder tel quel** : HEP-21 (documentation) — utile si une app mobile arrive.
