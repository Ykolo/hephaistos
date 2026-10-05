# Observabilité — savoir avant Jules

Objectif (HEP-38) : apprendre qu'un webhook Stripe échoue avant que Jules ne
s'en aperçoive sur son relevé bancaire.

## Ce que le code fait déjà

| Brique                        | Où                                         |
| ----------------------------- | ------------------------------------------ |
| Sentry serveur (Node + Edge)  | `src/instrumentation.ts`                   |
| Sentry navigateur             | `src/instrumentation-client.ts`            |
| Erreur du layout racine       | `src/app/global-error.tsx`                 |
| Nettoyage des données perso   | `src/lib/sentry-scrub.ts` (testé)          |
| Erreurs des Server Actions    | `action()` → `captureError`, tag `action`  |
| Canal critique                | `captureCritical(canal, erreur)`           |
| Sonde                         | `GET /api/health` — base (bloquante), Redis (informative) |

Sans `NEXT_PUBLIC_SENTRY_DSN`, rien n'est envoyé : le local et la CI restent
silencieux.

## Les deux canaux

`captureError` est le flux ordinaire : tout bug y va, on le consulte.

`captureCritical` sert à ce qui **coûte de l'argent ou bloque des clients
sans bruit**. L'événement part en niveau `fatal`, avec le tag `alert` :

| Tag `alert`       | Quand                                         | Branché    |
| ----------------- | --------------------------------------------- | ---------- |
| `stripe-webhook`  | le webhook Stripe échoue (client débité, pas de commande) | HEP-59 |
| `cron`            | un cron échoue                                | ✅ réservations |
| `email`           | un email transactionnel n'est pas parti       | HEP-66     |

Le webhook Stripe **doit** appeler `captureCritical("stripe-webhook", …)` dans
son `catch`, et répondre en 500 pour que Stripe réessaie.

## Réglages à faire une fois (hors code)

### Sentry

1. Créer l'organisation en **région EU** (`de.sentry.io`), projet
   `hephaistos`, plateforme Next.js.
2. Dans Vercel, sur Production et Preview :
   `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`,
   `SENTRY_AUTH_TOKEN` (jeton d'organisation, droit `project:releases`).
3. Projet → Settings → Security & Privacy : activer **Data Scrubber** et
   **Scrub IP Addresses** (seconde barrière, côté Sentry).
4. Alertes → **Issue alert** « Critique » :
   - condition : *A new issue is created* **ou** *The issue changes state from resolved to unresolved* **ou** *The issue is seen more than 0 times in 1 minute* ;
   - filtre : `The event's tags match alert is set` ;
   - action : email **et** SMS/notification mobile ; fréquence 5 min.
5. Alertes → **Metric alert** « Taux d'erreurs » : plus de 10 erreurs en
   5 minutes, environnement `production` → email.

### Surveillance externe (Better Stack, offre gratuite)

Deux sondes toutes les 3 minutes, depuis au moins deux régions :

- `https://hephaistosparis.com/` — attendu : 200
- `https://hephaistosparis.com/api/health` — attendu : 200 et `"ok":true`

Alerte par email + SMS après 2 échecs consécutifs.

⚠️ À poser **après** la bascule du domaine (HEP-87) : aujourd'hui, toutes les
URL `*.vercel.app` sont derrière Vercel Authentication et répondent 401 à une
sonde externe.

### Échec d'envoi Resend

Couvert par le canal `email` dès que HEP-66 appellera `captureCritical`.

## Vérifier que ça marche

- Erreur volontaire : une Server Action qui lève une `Error` en preview doit
  apparaître dans Sentry en moins d'une minute, **sans** email ni token dans
  l'événement.
- Canal critique : même chose avec `captureCritical("cron", new Error("test"))`
  — l'alerte « Critique » doit se déclencher, pas seulement l'issue.
