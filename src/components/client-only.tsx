"use client";

import { useSyncExternalStore, type ReactNode } from "react";

/** Aucun abonnement : la valeur ne change qu'une fois, à l'hydratation. */
const noopSubscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * Vrai une fois l'hydratation faite, faux pendant le rendu serveur.
 *
 * `useSyncExternalStore` est le mécanisme prévu par React pour distinguer les
 * deux — plus sûr qu'un `setState` dans un effet, qui provoque un second rendu
 * et que le compilateur React signale à juste titre.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, onClient, onServer);
}

/**
 * Ne rend ses enfants qu'après l'hydratation.
 *
 * Réservé à ce qui est **propre à un visiteur** — le panier, typiquement.
 *
 * Deux raisons, et la seconde est la plus importante :
 *
 * 1. `cacheComponents` interdit `Date.now()` (utilisé par TanStack Query) dans
 *    un composant client prérendu hors `Suspense`.
 * 2. Surtout : le chrome vit dans le layout racine, **prérendu et partagé**.
 *    Un compteur de panier calculé au prérendu serait figé dans la coquille
 *    statique et montré à tous les visiteurs — chacun verrait le panier de
 *    celui qui a déclenché la génération.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useHydrated() ? <>{children}</> : <>{fallback}</>;
}
