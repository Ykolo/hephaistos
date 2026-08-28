import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { CART_TTL_DAYS } from "./services/cart";

/**
 * Identification du panier par cookie (HEP-46).
 *
 * Seul endroit du code qui touche aux cookies : le service panier reste pur et
 * testable sans HTTP.
 *
 * Le cookie contient un **token aléatoire**, jamais l'identifiant du panier.
 * Un `id` séquentiel ou un UUID de base laisserait deviner — ou énumérer — les
 * paniers des autres clients.
 */
export const CART_COOKIE = "hep_cart";

/** 32 octets d'entropie : impossible à deviner ou à énumérer. */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

const cookieOptions = {
  httpOnly: true, // invisible pour JavaScript : rien à voler par XSS
  sameSite: "lax" as const, // survit à un retour depuis Stripe, bloque le CSRF
  secure: process.env.NODE_ENV === "production", // http en local, sinon absent
  path: "/",
  maxAge: CART_TTL_DAYS * 24 * 60 * 60, // persistant : survit à la fermeture
};

/**
 * Token du panier courant, sans en créer.
 *
 * Utilisable pendant le rendu : un composant serveur ne peut pas écrire de
 * cookie, seule une Server Action le peut.
 */
export async function readCartToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

/**
 * Token du panier, créé et posé s'il n'existe pas.
 *
 * À n'appeler que depuis une Server Action ou un Route Handler — écrire un
 * cookie pendant le rendu lève une erreur côté Next.
 */
export async function requireCartToken(): Promise<string> {
  const store = await cookies();
  const existing = store.get(CART_COOKIE)?.value;
  if (existing) {
    // Réécrit à chaque interaction : le panier repart pour 30 jours plutôt
    // que d'expirer 30 jours après la première visite.
    store.set(CART_COOKIE, existing, cookieOptions);
    return existing;
  }

  const token = newToken();
  store.set(CART_COOKIE, token, cookieOptions);
  return token;
}

/** Oublie le panier courant — après une commande payée (lot 4). */
export async function clearCartCookie(): Promise<void> {
  const store = await cookies();
  store.delete(CART_COOKIE);
}
