import type { ShippingMethod } from "@/generated/prisma/client";
import { computeTotals, type PricingDiscount, type PricingLine, type Totals } from "@/server/services/pricing";

/**
 * Frais de port (HEP-70) — la partie **pure**, partagée par le panier serveur,
 * l'affichage optimiste du navigateur et la création de la commande.
 *
 * Même raison d'être que le moteur de prix (HEP-47) : si le navigateur et le
 * serveur choisissaient la tranche de poids chacun à sa façon, le montant
 * sauterait au retour de la requête — ou pire, le client paierait un autre
 * port que celui qu'il a vu.
 *
 * La grille elle-même vit en base (`ShippingRate`) et se modifie dans
 * `/admin/livraison`. Ce fichier ne fait que la lire.
 */

/**
 * Poids forfaitaire du colis vide : carton, calage, bordereau.
 *
 * PROVISOIRE — à trancher par Jules (HEP-70). Le poids d'un produit
 * (`Product.weightGrams`) est celui du produit dans sa boîte ; ceci s'ajoute
 * **une fois** par colis.
 */
export const PACKAGING_GRAMS = 150;

/** Une tranche de la grille, telle que le navigateur la reçoit. */
export type ShippingRateView = {
  carrier: string;
  method: ShippingMethod;
  /** Borne **incluse** : un colis de 500 g relève de la tranche « ≤ 500 g ». */
  maxWeightGrams: number;
  priceCents: number;
  /** Livraison offerte dès ce montant, remise déduite. `null` = jamais. */
  freeAboveCents: number | null;
};

/** Ordre d'affichage : le moins cher d'abord, c'est le choix le plus fréquent. */
export const SHIPPING_METHODS: readonly ShippingMethod[] = ["PICKUP_POINT", "HOME"];

export const SHIPPING_METHOD_LABELS: Record<ShippingMethod, string> = {
  PICKUP_POINT: "Point relais",
  HOME: "Livraison à domicile",
};

export const CARRIERS = ["colissimo", "mondial_relay"] as const;
export type Carrier = (typeof CARRIERS)[number];

export const CARRIER_LABELS: Record<string, string> = {
  colissimo: "Colissimo",
  mondial_relay: "Mondial Relay",
};

export function carrierLabel(carrier: string): string {
  return CARRIER_LABELS[carrier] ?? carrier;
}

/** Poids du colis : produits × quantités, plus l'emballage. Panier vide = 0. */
export function parcelWeightGrams(
  lines: readonly { qty: number; weightGrams: number }[],
): number {
  if (lines.length === 0) return 0;
  return lines.reduce((n, l) => n + l.qty * l.weightGrams, PACKAGING_GRAMS);
}

/**
 * La tranche qui s'applique : la plus petite borne qui contient le poids.
 *
 * `null` si le colis dépasse la dernière tranche du mode — ce mode n'est alors
 * pas proposé, plutôt que facturé au prix d'une tranche trop légère.
 */
export function rateFor(
  rates: readonly ShippingRateView[],
  method: ShippingMethod,
  weightGrams: number,
): ShippingRateView | null {
  let best: ShippingRateView | null = null;
  for (const rate of rates) {
    if (rate.method !== method || rate.maxWeightGrams < weightGrams) continue;
    if (best === null || rate.maxWeightGrams < best.maxWeightGrams) best = rate;
  }
  return best;
}

/** Un tarif par mode disponible pour ce poids, dans l'ordre d'affichage. */
export function shippingOptions(
  rates: readonly ShippingRateView[],
  weightGrams: number,
): ShippingRateView[] {
  return SHIPPING_METHODS.flatMap((method) => {
    const rate = rateFor(rates, method, weightGrams);
    return rate ? [rate] : [];
  });
}

export type FreeShippingHint = {
  /** Ce qu'il manque, remise déduite. Toujours strictement positif. */
  remainingCents: number;
  /**
   * Le mode concerné, quand le client n'a pas encore choisi et que les seuils
   * diffèrent d'un mode à l'autre. `null` = le seuil vaut pour son choix.
   */
  method: ShippingMethod | null;
};

export type CartShipping = {
  /** Grille active complète, pour recalculer côté navigateur sans requête. */
  rates: ShippingRateView[];
  /** Mode enregistré sur le panier, même s'il n'est plus disponible. */
  method: ShippingMethod | null;
  weightGrams: number;
  /** Modes proposés pour ce poids. */
  options: ShippingRateView[];
  /** Tarif retenu. `null` tant que le client n'a pas choisi, ou si son choix ne convient plus. */
  selected: ShippingRateView | null;
  /** Le mode choisi ne convient plus (colis devenu trop lourd, tranche désactivée). */
  methodUnavailable: boolean;
  freeShippingHint: FreeShippingHint | null;
};

/**
 * Prix d'un mode pour ce panier : `0` s'il est offert.
 *
 * Sert à afficher chaque option avant que le client ne choisisse ; le montant
 * retenu, lui, sort de `computeTotals`.
 */
export function optionPriceCents(option: ShippingRateView, totals: Totals, discount: PricingDiscount | null): number {
  const goodsCents = totals.subtotalCents - totals.discountCents;
  const freeByCode = discount?.type === "FREE_SHIPPING" && totals.discountCode !== null;
  if (freeByCode) return 0;
  if (option.freeAboveCents !== null && goodsCents >= option.freeAboveCents) return 0;
  return option.priceCents;
}

/**
 * Totaux d'un panier, livraison comprise.
 *
 * Le seul chemin qui associe la grille au moteur de prix : panier, navigateur
 * et commande passent tous par ici. Le franco se juge **après remise**
 * (`computeTotals`, étape 3) — sinon un « −20 % » sur 55 € ferait payer 44 €
 * tout en offrant le port calculé sur 55 €.
 */
export function priceCart(input: {
  lines: readonly (PricingLine & { weightGrams: number })[];
  discount: PricingDiscount | null;
  rates: readonly ShippingRateView[];
  method: ShippingMethod | null;
  vatRateBps?: number;
}): { totals: Totals; shipping: CartShipping } {
  const weightGrams = parcelWeightGrams(input.lines);
  const options = input.lines.length > 0 ? shippingOptions(input.rates, weightGrams) : [];
  const selected = input.method ? (options.find((o) => o.method === input.method) ?? null) : null;

  const totals = computeTotals({
    lines: input.lines.map(({ productId, qty, unitPriceCents }) => ({ productId, qty, unitPriceCents })),
    discount: input.discount,
    shipping: selected,
    vatRateBps: input.vatRateBps,
  });

  return {
    totals,
    shipping: {
      rates: [...input.rates],
      method: input.method,
      weightGrams,
      options,
      selected,
      methodUnavailable: input.method !== null && selected === null && input.lines.length > 0,
      freeShippingHint: freeShippingHint(totals, selected ? [selected] : options, input.discount),
    },
  };
}

/**
 * « Plus que 12 € pour la livraison offerte. »
 *
 * Sur le mode choisi s'il y en a un ; sinon sur le seuil le plus proche parmi
 * les modes proposés. Rien quand le port est déjà offert, ou qu'aucun mode
 * n'a de seuil.
 */
function freeShippingHint(
  totals: Totals,
  candidates: readonly ShippingRateView[],
  discount: PricingDiscount | null,
): FreeShippingHint | null {
  if (totals.freeShipping) return null;
  if (discount?.type === "FREE_SHIPPING" && totals.discountCode !== null) return null;

  const goodsCents = totals.subtotalCents - totals.discountCents;
  const withThreshold = candidates.filter((c) => c.freeAboveCents !== null);
  if (withThreshold.length === 0) return null;

  const nearest = withThreshold.reduce((a, b) => (b.freeAboveCents! < a.freeAboveCents! ? b : a));
  const remainingCents = nearest.freeAboveCents! - goodsCents;
  // Déjà atteint sur un mode non choisi : l'option l'affiche « offerte », pas
  // besoin d'un message en plus.
  if (remainingCents <= 0) return null;

  const sameEverywhere =
    candidates.length === 1 || candidates.every((c) => c.freeAboveCents === nearest.freeAboveCents);
  return { remainingCents, method: sameEverywhere ? null : nearest.method };
}
