# Héphaïstos — Front-end

Site vitrine / e-commerce **mobile-first** pour la marque de soins visage homme
**Héphaïstos** (« Se forger, chaque jour. »). Implémentation front-end fidèle
à la maquette `Hephaistos Mobile.dc.html` (Claude Design).

## Stack

- **Next.js 16** (App Router, React 19, React Compiler) + **TypeScript**
- **Tailwind CSS v4** — palette de marque + keyframes dans `src/app/globals.css`
- **shadcn/ui** — primitives UI (`src/components/ui`)
- **Framer Motion** — reveals au scroll, transitions de page, overlays, curseur custom
- **Zustand** — état UI global (menu, panier, recherche, annonce, curseur) avec
  persistance de la préférence de curseur
- **TanStack Query** — couche données du catalogue (mock async, prête pour un vrai backend)

## Routes (9)

| Route             | Page                                  |
| ----------------- | ------------------------------------- |
| `/`               | Accueil (hero, manifeste, collection) |
| `/boutique`       | Les Fondations (collection)           |
| `/produit/[id]`   | Page produit (galerie, accordéons)    |
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
  hooks/               useIsMobile, useHasFinePointer
  lib/                 products (data), queries (TanStack), routes
  store/               ui-store (Zustand)
```

## Développement

```bash
bun install
bun run dev      # http://localhost:3000
bun run build    # build de production
bun run start    # sert le build
bun run lint
```

> Front-end uniquement : le catalogue est statique et résolu via une couche
> TanStack Query, prête à brancher sur une vraie API. Les formulaires
> (contact, newsletter) sont simulés côté client.
