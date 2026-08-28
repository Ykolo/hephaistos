"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  addToCart,
  emptyCart,
  getCart,
  removeFromCart,
  setCartQty,
} from "@/server/actions/cart";
import type { CartView } from "@/server/services/cart";

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

const EMPTY: CartView = {
  lines: [],
  itemCount: 0,
  subtotalCents: 0,
  hasUnavailableLines: false,
};

export function useCart() {
  return useQuery({
    queryKey: cartKey,
    queryFn: () => getCart(),
    initialData: EMPTY,
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

/** Recalcule les totaux après une modification locale des lignes. */
function withTotals(lines: CartView["lines"]): CartView {
  return {
    lines,
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
    subtotalCents: lines.reduce((n, l) => n + l.lineTotalCents, 0),
    hasUnavailableLines: lines.some(
      (l) => !l.isPreorder && l.qty > l.availableUnits,
    ),
  };
}

export function useAddToCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { slug: string; qty?: number }) => {
      const r = await addToCart({ slug: vars.slug, qty: vars.qty ?? 1 });
      // Le contrat d'erreur de HEP-34 : on lève pour que `onError` rétablisse
      // l'état précédent, et le message remonte tel quel à l'affichage.
      if (!r.ok) throw new Error(r.message);
      return r.data;
    },
    onMutate: (vars) =>
      optimistic(qc, (cart) => {
        const lines = cart.lines.map((l) =>
          l.slug === vars.slug
            ? {
                ...l,
                qty: l.qty + (vars.qty ?? 1),
                lineTotalCents: l.unitPriceCents * (l.qty + (vars.qty ?? 1)),
              }
            : l,
        );
        // Produit absent du panier : impossible de deviner son prix ni son
        // visuel côté client. On laisse la réponse serveur l'introduire.
        return cart.lines.some((l) => l.slug === vars.slug)
          ? withTotals(lines)
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
    mutationFn: async (vars: { slug: string; qty: number }) => {
      const r = await setCartQty(vars);
      if (!r.ok) throw new Error(r.message);
      return r.data;
    },
    onMutate: (vars) =>
      optimistic(qc, (cart) =>
        withTotals(
          vars.qty <= 0
            ? cart.lines.filter((l) => l.slug !== vars.slug)
            : cart.lines.map((l) =>
                l.slug === vars.slug
                  ? {
                      ...l,
                      qty: vars.qty,
                      lineTotalCents: l.unitPriceCents * vars.qty,
                    }
                  : l,
              ),
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
    mutationFn: async (vars: { slug: string }) => {
      const r = await removeFromCart(vars);
      if (!r.ok) throw new Error(r.message);
      return r.data;
    },
    onMutate: (vars) =>
      optimistic(qc, (cart) =>
        withTotals(cart.lines.filter((l) => l.slug !== vars.slug)),
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
    mutationFn: async () => {
      const r = await emptyCart({});
      if (!r.ok) throw new Error(r.message);
      return r.data;
    },
    onMutate: () => optimistic(qc, () => EMPTY),
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(cartKey, ctx.previous);
    },
    onSuccess: (data) => qc.setQueryData(cartKey, data),
  });
}
