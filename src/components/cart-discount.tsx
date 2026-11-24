"use client";

import { useState } from "react";
import type { CartView } from "@/server/services/cart";
import { discountLabel } from "@/lib/discounts";
import { formatPriceCompact } from "@/lib/format";
import {
  useApplyDiscount,
  useDismissCartNotice,
  useRemoveDiscount,
} from "@/lib/cart-queries";

/**
 * Code promo du panier (HEP-75).
 *
 * Un seul code à la fois : saisir un nouveau code remplace l'ancien, ce que le
 * libellé du bouton dit quand un code est déjà posé.
 */
export function CartDiscountField({ cart }: { cart: CartView }) {
  const apply = useApplyDiscount();
  const remove = useRemoveDiscount();
  const [value, setValue] = useState("");
  const current = cart.discount;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    // `onSubmit` et non `<form action>` : React 19 viderait le champ après
    // l'envoi, et le client devrait retaper le code pour corriger une faute.
    event.preventDefault();
    apply.mutate({ code: value }, { onSuccess: () => setValue("") });
  }

  return (
    <div className="mb-6">
      {current && (
        <div className="mb-3 flex items-start justify-between gap-3 border border-line-strong px-3 py-2">
          <div className="min-w-0">
            <span className="font-mono text-[12.5px] tracking-[.06em]">{current.code}</span>
            {current.pricing && !current.message && (
              <span className="ml-2 text-[12px] text-muted-ink">{discountLabel(current.pricing)}</span>
            )}
            {current.message && (
              <p role="status" className="m-0 mt-1 text-[11.5px] leading-[1.5] text-red-700">
                {current.message}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            aria-label={`Retirer le code promo ${current.code}`}
            className="shrink-0 cursor-pointer bg-transparent text-[11.5px] text-muted-ink underline underline-offset-4 disabled:opacity-40"
          >
            Retirer
          </button>
        </div>
      )}

      <form onSubmit={submit} noValidate>
        <label
          htmlFor="promo"
          className="mb-1.5 block text-[11px] uppercase tracking-[.12em] text-muted-ink"
        >
          {current ? "Utiliser un autre code" : "Code promo"}
        </label>
        <div className="flex">
          <input
            id="promo"
            name="code"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (apply.isError) apply.reset();
            }}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={40}
            aria-invalid={apply.isError || undefined}
            aria-describedby={apply.isError ? "promo-error" : undefined}
            className="min-w-0 flex-1 border border-r-0 border-line-strong bg-transparent px-3 py-2 text-[14px] uppercase outline-none focus:border-ink"
          />
          <button
            type="submit"
            disabled={apply.isPending || value.trim() === ""}
            className="cursor-pointer border border-ink bg-ink px-4 text-[11px] font-semibold uppercase tracking-[.14em] text-white transition-colors hover:bg-paper hover:text-ink disabled:cursor-default disabled:opacity-50"
          >
            {apply.isPending ? "…" : current ? "Remplacer" : "Appliquer"}
          </button>
        </div>
        {apply.isError && (
          <p id="promo-error" role="alert" className="m-0 mt-1.5 text-[11.5px] leading-[1.5] text-red-700">
            {apply.error.message}
          </p>
        )}
      </form>
    </div>
  );
}

/** Ligne « Remise » du récapitulatif, absente tant qu'aucune remise ne joue. */
export function CartDiscountLine({ cart, className = "" }: { cart: CartView; className?: string }) {
  if (cart.totals.discountCents <= 0 || !cart.totals.discountCode) return null;
  return (
    <div className={`flex items-baseline justify-between ${className}`}>
      <span className="text-[13px] text-body">Remise ({cart.totals.discountCode})</span>
      <span className="text-[13px] tabular-nums">
        −{formatPriceCompact(cart.totals.discountCents)}
      </span>
    </div>
  );
}

/** Message ponctuel du panier, fermé par le client (HEP-49). */
export function CartNotice({ cart }: { cart: CartView }) {
  const dismiss = useDismissCartNotice();
  if (!cart.notice) return null;
  return (
    <div role="status" className="mb-5 flex items-start gap-3 border border-line-strong bg-paper p-3">
      <p className="m-0 flex-1 text-[12px] leading-[1.55] text-body">{cart.notice}</p>
      <button
        type="button"
        onClick={() => dismiss.mutate()}
        aria-label="Fermer le message"
        className="cursor-pointer bg-transparent text-[13px] text-muted-ink"
      >
        ✕
      </button>
    </div>
  );
}
