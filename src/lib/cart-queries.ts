"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  addToCart,
  applyDiscount,
  dismissCartNotice,
  emptyCart,
  getCart,
  removeDiscount,
  removeFromCart,
  setCartQty,
} from "@/server/actions/cart";
import type { CartView } from "@/server/services/cart";
import type { ActionResult } from "@/server/errors";
import { computeTotals } from "@/server/services/pricing";
import { discountRefusalMessage } from "@/lib/discounts";

/**
 * Couche cliente du panier (HEP-50).
 *
 * TanStack Query reprend ici son rôle légitime — de l'interactif réel — après
 * avoir été retiré du catalogue en HEP-45, où il n'enveloppait qu'un `setTimeout`.
 *
 * Le panier reste **la vérité serveur** : chaque mutation renvoie l'état
 * recalculé en base, qui écrase l'état optimiste. Une quantité refusée côté
 * serveur revient donc automatiquement à sa valeur réelle.
 */

export const cartKey = ["cart"] as const;

const EMPTY: CartView = withTotals([], null);

export function useCart() {
  return useQuery({
    queryKey: cartKey,
    queryFn: () => getCart(),
    // Panier vide comme état de départ, pour ne jamais rendre `undefined`.
    initialData: EMPTY,
    // Sans cette ligne, TanStack considère `initialData` comme **fraîche** et
    // le `staleTime` l'empêche d'aller chercher le vrai panier : rouvrir
    // /panier affichait « votre panier est vide » alors qu'il ne l'était pas.
    // Datée de l'époque, elle est périmée d'emblée et déclenche le chargement.
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
  });
}

/** Applique un changement local en attendant la réponse serveur. */
function optimistic(
  qc: QueryClient,
  update: (current: CartView) => CartView,
): { previous: CartView | undefined } {
  const previous = qc.getQueryData<CartView>(cartKey);
  if (previous) qc.setQueryData<CartView>(cartKey, update(previous));
  return { previous };
}

/**
 * Recalcule les totaux après une modification locale des lignes.
 *
 * Passe par le **même** moteur que le serveur (HEP-47) plutôt que par une
 * somme écrite ici : deux formules, ce sont deux montants, et le client verrait
 * son total sauter au retour de la requête.
 *
 * Le code promo suit : le serveur a déjà jugé le code lui-même (dates,
 * quotas) ; ce qui dépend des lignes — minimum, produit ciblé — se recalcule
 * ici avec elles, pour que la remise apparaisse ou disparaisse en même temps
 * que la quantité change.
 */
function withTotals(lines: CartView["lines"], base: CartView | null): CartView {
  const pricing = base?.discount?.pricing ?? null;
  const totals = computeTotals({ lines, discount: pricing });
  const discount = base?.discount
    ? {
        ...base.discount,
        message: pricing
          ? totals.discountRejectedFor
            ? discountRefusalMessage(totals.discountRejectedFor, {
                minOrderCents: pricing.minOrderCents,
              })
            : null
          : base.discount.message,
      }
    : null;

  return {
    // Le total de ligne vient du moteur, pas d'une multiplication recopiée
    // dans chaque `onMutate`.
    lines: lines.map((l, i) => ({ ...l, lineTotalCents: totals.lines[i].lineTotalCents })),
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
    totals,
    hasUnavailableLines: lines.some(
      (l) => !l.isPreorder && l.qty > l.availableUnits,
    ),
    discount,
    notice: base?.notice ?? null,
  };
}

/**
 * Résultat d'une action → données ou exception.
 *
 * Le contrat d'erreur de HEP-34 : on lève pour que `onError` rétablisse l'état
 * précédent, et le message remonte tel quel à l'affichage.
 */
function unwrap(r: ActionResult<CartView>): CartView {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

export function useAddToCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { slug: string; qty?: number }) =>
      unwrap(await addToCart({ slug: vars.slug, qty: vars.qty ?? 1 })),
    onMutate: (vars) =>
      optimistic(qc, (cart) => {
        const lines = cart.lines.map((l) =>
          l.slug === vars.slug ? { ...l, qty: l.qty + (vars.qty ?? 1) } : l,
        );
        // Produit absent du panier : impossible de deviner son prix ni son
        // visuel côté client. On laisse la réponse serveur l'introduire.
        return cart.lines.some((l) => l.slug === vars.slug)
          ? withTotals(lines, cart)
          : cart;
      }),
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(cartKey, ctx.previous);
    },
    onSuccess: (data) => qc.setQueryData(cartKey, data),
  });
}

export function useSetCartQty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { slug: string; qty: number }) => unwrap(await setCartQty(vars)),
    onMutate: (vars) =>
      optimistic(qc, (cart) =>
        withTotals(
          vars.qty <= 0
            ? cart.lines.filter((l) => l.slug !== vars.slug)
            : cart.lines.map((l) =>
                l.slug === vars.slug ? { ...l, qty: vars.qty } : l,
              ),
          cart,
        ),
      ),
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(cartKey, ctx.previous);
    },
    onSuccess: (data) => qc.setQueryData(cartKey, data),
  });
}

export function useRemoveFromCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { slug: string }) => unwrap(await removeFromCart(vars)),
    onMutate: (vars) =>
      optimistic(qc, (cart) =>
        withTotals(cart.lines.filter((l) => l.slug !== vars.slug), cart),
      ),
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(cartKey, ctx.previous);
    },
    onSuccess: (data) => qc.setQueryData(cartKey, data),
  });
}

export function useEmptyCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await emptyCart({})),
    onMutate: () => optimistic(qc, (cart) => withTotals([], cart)),
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(cartKey, ctx.previous);
    },
    onSuccess: (data) => qc.setQueryData(cartKey, data),
  });
}

/**
 * Code promo (HEP-75). Pas d'état optimiste : seul le serveur sait si le code
 * existe, et afficher une remise qu'il refuserait une seconde plus tard serait
 * pire qu'un bref « Vérification… ».
 */
export function useApplyDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { code: string }) => unwrap(await applyDiscount(vars)),
    onSuccess: (data) => qc.setQueryData(cartKey, data),
  });
}

export function useRemoveDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await removeDiscount({})),
    onMutate: () =>
      optimistic(qc, (cart) => withTotals(cart.lines, { ...cart, discount: null })),
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(cartKey, ctx.previous);
    },
    onSuccess: (data) => qc.setQueryData(cartKey, data),
  });
}

export function useDismissCartNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await dismissCartNotice({})),
    onMutate: () => optimistic(qc, (cart) => ({ ...cart, notice: null })),
    onSuccess: (data) => qc.setQueryData(cartKey, data),
  });
}
