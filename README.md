# Héphaïstos

Site e-commerce **mobile-first** pour la marque de soins visage homme
**Héphaïstos** (« Se forger, chaque jour. »). Le front suit la maquette
`Hephaistos Mobile.dc.html` (Claude Design) ; le back est monté lot par lot
depuis `docs/BACKEND.md`.

## Documentation

| Document                              | Pour qui                                              |
| ------------------------------------- | ----------------------------------------------------- |
| [Démarrage](docs/DEMARRAGE.md)        | Installer, lancer, tester — et les pièges du projet   |
| [Commandes et prix](docs/COMMANDES.md)| Appeler le moteur : totaux, commande, annulation      |
| [Back-office](docs/BACK-OFFICE.md)    | Mode d'emploi non technique de l'administration       |
| [Plan backend](docs/BACKEND.md)       | Architecture, modèle de données, invariants critiques |

## Stack

- **Next.js 16** (App Router, React 19, React Compiler) + **TypeScript**
- **Tailwind CSS v4** — palette de marque + keyframes dans `src/app/globals.css`
- **shadcn/ui** — primitives UI (`src/components/ui`)
- **Framer Motion** — reveals au scroll, transitions de page, overlays, curseur custom
- **Zustand** — état UI global (menu, panier, recherche, annonce, curseur) avec
  persistance de la préférence de curseur
- **TanStack Query** — couche données du panier (mutations optimistes)
- **Prisma 7 + Postgres (Neon)** — catalogue, stock, panier et commandes en base
- **Vitest** — suite serveur sur base jetable

## Routes publiques (10)

| Route             | Page                                  |
| ----------------- | ------------------------------------- |
| `/`               | Accueil (hero, manifeste, collection) |
| `/boutique`       | Les Fondations (collection)           |
| `/produit/[id]`   | Page produit (galerie, accordéons)    |
| `/panier`         | Panier serveur                        |
| `/histoire`       | L'histoire de la marque               |
| `/vision`         | Roadmap / vision                      |
| `/avis`           | Avis & avant/après                    |
| `/contact`        | Formulaire de contact                 |
| `/newsletter`     | Accès prioritaire                     |
| `/legal`          | Mentions & conditions (onglets)       |

## Structure

```
src/
  app/                 routes (App Router) + layout + globals.css
  components/
    ui/                shadcn/ui
    site-chrome.tsx    orchestrateur (header, footer, overlays, curseur)
    header / footer / mobile-menu / cart-drawer / search-overlay
    custom-cursor.tsx  curseur « forge » + sélecteur (desktop)
    reveal.tsx         wrapper reveal-au-scroll (Framer Motion)
    product-*.tsx      carte, grille, détail produit
    primitives.tsx     boutons / labels réutilisables
    admin/             formulaires du back-office
  hooks/               useIsMobile, useHasFinePointer
  lib/                 cart-queries (TanStack), validation Zod, routes
  server/
    actions/           Server Actions — lisent cookies et session
    services/          logique métier pure — voir services/README.md
  store/               ui-store (Zustand)
prisma/                schema, migrations, seed
tests/                 Vitest, base jetable
```

## Développement

```bash
bun install
bun run db:local:up && bun run db:migrate && bun run db:seed
bun run dev            # http://localhost:3000
bun run test
bun run typecheck && bun run lint && bun run build
```

Détails, variables d'environnement et pièges : **[docs/DEMARRAGE.md](docs/DEMARRAGE.md)**.

> Le paiement (Stripe), les mails (Resend), l'expédition (Sendcloud) et
> l'authentification (Better Auth) ne sont **pas encore branchés** : leurs
> points d'accroche existent et sont testés, les clés attendent dans
> `.env.example`. `/admin` n'a pas d'authentification et reste bloqué hors
> développement local.
