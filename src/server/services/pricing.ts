import type { DiscountType } from "@/generated/prisma/client";

/**
 * Moteur de calcul des totaux (HEP-47).
 *
 * **Une seule implémentation, utilisée partout** : affichage du panier, session
 * Stripe Checkout (HEP-58), création de la commande (HEP-52), facture PDF
 * (HEP-61), remboursement partiel (HEP-60). Deux implémentations, ce sont deux
 * montants différents, et un litige client que personne ne peut trancher.
 *
 * `computeTotals` est **pure et sans I/O** : ni Prisma, ni `Date.now()`, ni
 * cookie. Les lignes arrivent déjà relues en base par l'appelant, la remise
 * déjà validée (dates, quotas, cumul — c'est le travail de HEP-75). Ici on ne
 * fait que de l'arithmétique en centimes, et cette arithmétique est testable
 * sans base de données.
 *
 * Seul fichier de `src/server/` que le client a le droit d'importer, et
 * précisément parce qu'il est pur : l'affichage optimiste du panier
 * (`src/lib/cart-queries.ts`) doit calculer comme le serveur, sinon le montant
 * saute au retour de la requête. La seule dépendance est un `import type`,
 * effacé à la compilation — aucun code Prisma ne part dans le bundle.
 */

/** TVA française de droit commun, en points de base. 2000 = 20,00 %. */
export const DEFAULT_VAT_RATE_BPS = 2000;

export type PricingLine = {
  /** Identifie la ligne dans la sortie et cible une remise produit. */
  productId: string;
  qty: number;
  /**
   * Prix unitaire **TTC**, relu en base.
   *
   * En B2C France, le prix annoncé est le prix payé : la TVA est déjà dedans.
   * Elle sera *extraite* du total, jamais ajoutée par-dessus.
   */
  unitPriceCents: number;
};

/**
 * Remise **déjà jugée valable** par l'appelant.
 *
 * Le moteur ne vérifie ni les dates, ni `maxUses`, ni le nombre d'utilisations
 * par client : ces contrôles demandent la base, et une fonction pure n'y touche
 * pas. Il ne vérifie que ce qui dépend du panier lui-même — le minimum de
 * commande et l'existence d'une ligne éligible.
 */
export type PricingDiscount = {
  code: string;
  type: DiscountType;
  /** Centimes pour `FIXED`, points de base pour `PERCENT`, ignoré sinon. */
  value: number;
  minOrderCents?: number | null;
  /** `null` = remise sur tout le panier ; sinon elle ne porte que ce produit. */
  productId?: string | null;
};

export type PricingShipping = {
  priceCents: number;
  /** Seuil de livraison offerte (franco). `null` = pas de franco. */
  freeAboveCents?: number | null;
};

export type ComputeTotalsInput = {
  lines: readonly PricingLine[];
  discount?: PricingDiscount | null;
  /**
   * Mode de livraison retenu.
   *
   * Absent tant que le client n'a pas choisi : le panier affiche alors
   * « calculée à l'étape suivante » et `shippingKnown` vaut `false`.
   */
  shipping?: PricingShipping | null;
  /** Taux de TVA en points de base. Figé sur la commande à sa création. */
  vatRateBps?: number;
};

export type TotalsLine = {
  productId: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  /**
   * Part de la remise panier imputée à cette ligne.
   *
   * La somme de ces parts égale **exactement** `discountCents` : c'est ce qui
   * permet à une facture de tomber juste et à un remboursement partiel de
   * rendre le bon montant (HEP-60, HEP-61).
   */
  discountCents: number;
  /** `lineTotalCents - discountCents` : ce que la ligne pèse réellement. */
  netCents: number;
};

/** Pourquoi une remise pourtant valide n'a rien donné sur ce panier. */
export type DiscountRejection =
  /** Le panier n'atteint pas `minOrderCents`. */
  | "BELOW_MINIMUM"
  /** Remise ciblée sur un produit absent du panier. */
  | "NOT_APPLICABLE";

export type Totals = {
  lines: TotalsLine[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  /** TVA **extraite** de `totalCents`, pas ajoutée. */
  taxCents: number;
  totalCents: number;
  vatRateBps: number;
  /**
   * `false` tant qu'aucun mode de livraison n'a été fourni.
   *
   * `totalCents` est alors un total **hors livraison** : l'afficher comme
   * montant final serait un mensonge, et une infraction à l'article L112-1 du
   * code de la consommation.
   */
  shippingKnown: boolean;
  /** Livraison offerte, par franco ou par code `FREE_SHIPPING`. */
  freeShipping: boolean;
  discountCode: string | null;
  discountRejectedFor: DiscountRejection | null;
};

/**
 * Rien de fractionnaire n'entre : les montants sont des centimes, les taux des
 * points de base, les quantités des unités.
 *
 * Un flottant qui arriverait ici viendrait forcément de notre propre code — le
 * client ne transmet jamais de prix (HEP-46). C'est donc un bug, pas une
 * erreur métier : il doit exploser en test, pas devenir une `ActionError`
 * affichée au visiteur.
 */
function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`pricing: ${label} doit être un entier (reçu ${value}).`);
  }
}

/**
 * Ventile un montant sur des poids, sans perdre ni inventer un centime.
 *
 * Méthode du plus fort reste : on distribue les parts entières, puis les
 * centimes restants aux lignes dont la part décimale est la plus grande. Un
 * simple `Math.round` par ligne laisserait un écart de quelques centimes entre
 * la somme des lignes et le total — l'erreur classique qui rend une facture
 * fausse.
 */
function allocateProRata(amountCents: number, weights: readonly number[]): number[] {
  const totalWeight = weights.reduce((n, w) => n + w, 0);
  const shares = weights.map(() => 0);
  if (amountCents === 0 || totalWeight === 0) return shares;

  const remainders: { index: number; fraction: number }[] = [];
  let distributed = 0;

  weights.forEach((weight, index) => {
    const exact = (amountCents * weight) / totalWeight;
    const floor = Math.floor(exact);
    shares[index] = floor;
    distributed += floor;
    remainders.push({ index, fraction: exact - floor });
  });

  // Départage stable : à reste égal, la ligne la plus haute du panier prend le
  // centime. Sans ce critère, deux calculs du même panier pourraient différer.
  remainders.sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let i = 0; i < amountCents - distributed; i++) {
    shares[remainders[i % remainders.length].index] += 1;
  }

  return shares;
}

/**
 * Calcule les totaux d'un panier ou d'une commande.
 *
 * **L'ordre est figé** et ne doit pas changer sans reprendre les tests :
 *
 * 1. sous-total (somme des lignes TTC) ;
 * 2. remise ;
 * 3. livraison — *après* la remise, pour que le franco se juge sur ce que le
 *    client paie réellement ;
 * 4. TVA, extraite du total TTC ;
 * 5. total.
 */
export function computeTotals(input: ComputeTotalsInput): Totals {
  const vatRateBps = input.vatRateBps ?? DEFAULT_VAT_RATE_BPS;
  assertInteger(vatRateBps, "vatRateBps");

  // --- 1. Sous-total -------------------------------------------------------
  const lines = input.lines.map((line) => {
    assertInteger(line.unitPriceCents, `unitPriceCents (${line.productId})`);
    assertInteger(line.qty, `qty (${line.productId})`);
    return {
      ...line,
      lineTotalCents: line.unitPriceCents * line.qty,
      discountCents: 0,
      netCents: line.unitPriceCents * line.qty,
    } satisfies TotalsLine;
  });

  const subtotalCents = lines.reduce((n, l) => n + l.lineTotalCents, 0);

  // --- 2. Remise -----------------------------------------------------------
  const discount = input.discount ?? null;
  let discountCents = 0;
  let freeShipping = false;
  let discountRejectedFor: DiscountRejection | null = null;
  let discountCode: string | null = null;

  if (discount) {
    // Les lignes que la remise peut toucher : tout le panier, ou le seul
    // produit ciblé. La ventilation ne portera que sur celles-là.
    const eligible = discount.productId
      ? lines.filter((l) => l.productId === discount.productId)
      : lines;
    const baseCents = eligible.reduce((n, l) => n + l.lineTotalCents, 0);

    // Le minimum se juge sur le panier entier, pas sur la base éligible :
    // « 10 € offerts dès 60 € d'achat » parle bien du panier.
    if (discount.minOrderCents != null && subtotalCents < discount.minOrderCents) {
      discountRejectedFor = "BELOW_MINIMUM";
    } else if (baseCents === 0) {
      discountRejectedFor = "NOT_APPLICABLE";
    } else {
      const raw = rawDiscountCents(discount, baseCents);
      // Plafonnée à la base : une remise ne rend pas d'argent et ne finance
      // jamais les frais de port.
      discountCents = Math.min(raw, baseCents);
      freeShipping = discount.type === "FREE_SHIPPING";
      discountCode = discount.code;

      const shares = allocateProRata(
        discountCents,
        eligible.map((l) => l.lineTotalCents),
      );
      eligible.forEach((line, i) => {
        line.discountCents = shares[i];
        line.netCents = line.lineTotalCents - shares[i];
      });
    }
  }

  const goodsCents = subtotalCents - discountCents;

  // --- 3. Livraison --------------------------------------------------------
  const shipping = input.shipping ?? null;
  const shippingKnown = shipping !== null;

  if (
    shipping &&
    shipping.freeAboveCents != null &&
    goodsCents >= shipping.freeAboveCents
  ) {
    freeShipping = true;
  }

  let shippingCents = 0;
  if (shipping && !freeShipping) {
    assertInteger(shipping.priceCents, "shipping.priceCents");
    // Un panier vide ne s'expédie pas : facturer le port d'un panier sans
    // article afficherait un total sur une page vide.
    shippingCents = lines.length === 0 ? 0 : shipping.priceCents;
  }

  // --- 4 & 5. TVA extraite, puis total ------------------------------------
  const totalCents = goodsCents + shippingCents;

  // Le TTC est le point de départ : `totalCents * 0,20` donnerait 300 centimes
  // sur 15,00 € au lieu de 250, et la facture ne tomberait plus juste.
  const taxCents = taxIncludedIn(totalCents, vatRateBps);

  return {
    lines,
    subtotalCents,
    discountCents,
    shippingCents,
    taxCents,
    totalCents,
    vatRateBps,
    shippingKnown,
    freeShipping,
    discountCode,
    discountRejectedFor,
  };
}

/** Montant brut de la remise, avant plafonnement. */
function rawDiscountCents(discount: PricingDiscount, baseCents: number): number {
  switch (discount.type) {
    case "FIXED":
      assertInteger(discount.value, `discount.value (${discount.code})`);
      return Math.max(0, discount.value);
    case "PERCENT":
      return Math.max(0, Math.round((baseCents * discount.value) / 10_000));
    case "FREE_SHIPPING":
      // La valeur porte sur la livraison, pas sur les produits : elle est
      // appliquée à l'étape 3.
      return 0;
  }
}

/**
 * TVA contenue dans un montant TTC.
 *
 * Exposée à part pour les lignes de facture et les remboursements partiels,
 * qui doivent ventiler la TVA sans repasser par un panier complet.
 */
export function taxIncludedIn(
  amountCents: number,
  vatRateBps: number = DEFAULT_VAT_RATE_BPS,
): number {
  return Math.round(amountCents - amountCents / (1 + vatRateBps / 10_000));
}
