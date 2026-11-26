"use client";

import type { CartView } from "@/server/services/cart";
import { formatPriceCompact } from "@/lib/format";
import { useChooseShipping } from "@/lib/cart-queries";
import { carrierLabel, optionPriceCents, SHIPPING_METHOD_LABELS } from "@/lib/shipping";

/**
 * Mode de livraison et franco dans le panier (HEP-70).
 *
 * Le choix se fait **ici**, avant Stripe : le Checkout hébergé ne sait pas
 * afficher de sélecteur de point relais. Le point relais précis se choisira
 * à l'étape suivante (HEP-71).
 */
export function CartShippingChoice({ cart }: { cart: CartView }) {
  const choose = useChooseShipping();
  const { options, method, methodUnavailable } = cart.shipping;
  const discount = cart.discount?.pricing ?? null;

  if (options.length === 0) {
    return (
      <p role="alert" className="m-0 mb-5 text-[12px] leading-[1.55] text-red-700">
        Aucun mode de livraison ne convient à ce colis. Écrivez-nous, nous trouverons une solution.
      </p>
    );
  }

  return (
    <fieldset className="mb-5 border-0 p-0">
      <legend className="mb-2 text-[11px] uppercase tracking-[.12em] text-muted-ink">
        Mode de livraison
      </legend>
      {methodUnavailable && (
        <p role="alert" className="m-0 mb-2 text-[11.5px] leading-[1.5] text-red-700">
          Le mode choisi ne convient plus à ce colis. Choisissez-en un autre.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {options.map((option) => {
          const price = optionPriceCents(option, cart.totals, discount);
          const id = `shipping-${option.method}`;
          return (
            <label
              key={option.method}
              htmlFor={id}
              className={`flex cursor-pointer items-start gap-3 border px-3 py-2.5 transition-colors ${
                method === option.method ? "border-ink" : "border-line-strong"
              }`}
            >
              <input
                id={id}
                type="radio"
                name="shipping-method"
                value={option.method}
                checked={method === option.method}
                onChange={() => choose.mutate({ method: option.method })}
                className="mt-[3px] accent-ink"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px]">{SHIPPING_METHOD_LABELS[option.method]}</span>
                <span className="block text-[11.5px] text-muted-ink">
                  {carrierLabel(option.carrier)}
                  {option.method === "PICKUP_POINT" ? " — point choisi à l'étape suivante" : ""}
                </span>
              </span>
              <span className="shrink-0 text-[13px] tabular-nums">
                {price === 0 ? "Offerte" : formatPriceCompact(price)}
              </span>
            </label>
          );
        })}
      </div>
      {choose.isError && (
        <p role="alert" className="m-0 mt-2 text-[11.5px] leading-[1.5] text-red-700">
          {choose.error.message}
        </p>
      )}
    </fieldset>
  );
}

/** « Plus que 12 € pour la livraison offerte. » */
export function FreeShippingHint({ cart, className = "" }: { cart: CartView; className?: string }) {
  const hint = cart.shipping.freeShippingHint;
  if (!hint) return null;
  return (
    <p className={`m-0 text-[12px] leading-[1.5] text-body ${className}`}>
      Plus que <strong className="font-semibold">{formatPriceCompact(hint.remainingCents)}</strong> pour la
      livraison offerte
      {hint.method ? ` en ${SHIPPING_METHOD_LABELS[hint.method].toLowerCase()}` : ""}.
    </p>
  );
}

/** Valeur de la ligne « Livraison » du récapitulatif. */
export function shippingSummary(cart: CartView): string {
  if (cart.totals.shippingKnown) {
    return cart.totals.shippingCents === 0 ? "Offerte" : formatPriceCompact(cart.totals.shippingCents);
  }
  if (cart.totals.freeShipping) return "Offerte";
  return "À choisir";
}
