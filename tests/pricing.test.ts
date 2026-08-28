import { describe, expect, it } from "vitest";
import {
  computeTotals,
  DEFAULT_VAT_RATE_BPS,
  taxIncludedIn,
  type PricingLine,
} from "@/server/services/pricing";

/**
 * Le moteur de prix est pur : ces tests ne touchent **pas** la base. C'est
 * voulu — c'est le service le plus rentable à couvrir (HEP-47), et il doit
 * rester exécutable en une fraction de seconde.
 */

/** Les trois prix réels du catalogue, pour rester dans des ordres de grandeur vrais. */
const NETTOYANT = { productId: "p-nettoyant", unitPriceCents: 2400, qty: 1 };
const SERUM = { productId: "p-serum", unitPriceCents: 4900, qty: 1 };
const CREME = { productId: "p-creme", unitPriceCents: 3800, qty: 1 };

function lines(...items: PricingLine[]) {
  return items;
}

describe("sous-total", () => {
  it("somme les lignes au prix unitaire fois la quantité", () => {
    const t = computeTotals({
      lines: lines({ ...SERUM, qty: 3 }, NETTOYANT),
    });

    expect(t.subtotalCents).toBe(4900 * 3 + 2400);
    expect(t.lines[0].lineTotalCents).toBe(14_700);
    expect(t.totalCents).toBe(t.subtotalCents);
  });

  it("rend un panier vide à zéro, sans total négatif ni NaN", () => {
    const t = computeTotals({ lines: [] });

    expect(t).toMatchObject({
      subtotalCents: 0,
      discountCents: 0,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 0,
    });
  });

  it("refuse un montant fractionnaire — c'est un bug, pas une erreur métier", () => {
    expect(() =>
      computeTotals({ lines: lines({ ...SERUM, unitPriceCents: 49.5 }) }),
    ).toThrow(/entier/);
  });
});

describe("TVA — extraite du TTC, jamais ajoutée", () => {
  it("extrait 250 centimes d'un prix affiché à 15,00 €", () => {
    // L'exemple de l'issue. L'erreur classique — 1500 × 0,20 = 300 — fausse
    // la facture de 50 centimes par produit.
    const t = computeTotals({
      lines: lines({ productId: "p", unitPriceCents: 1500, qty: 1 }),
    });

    expect(t.taxCents).toBe(250);
    expect(t.totalCents).toBe(1500);
  });

  it("ne gonfle jamais le total : le TTC affiché est le TTC payé", () => {
    const t = computeTotals({ lines: lines(SERUM, CREME, NETTOYANT) });

    expect(t.totalCents).toBe(4900 + 3800 + 2400);
    expect(t.taxCents).toBeLessThan(t.totalCents);
  });

  it("suit le taux fourni, la commande figeant le sien", () => {
    const at55 = computeTotals({
      lines: lines({ productId: "p", unitPriceCents: 1055, qty: 1 }),
      vatRateBps: 550,
    });

    expect(at55.vatRateBps).toBe(550);
    expect(at55.taxCents).toBe(Math.round(1055 - 1055 / 1.055));
    expect(taxIncludedIn(1055, 550)).toBe(at55.taxCents);
  });

  it("prend 20 % par défaut", () => {
    expect(DEFAULT_VAT_RATE_BPS).toBe(2000);
    expect(computeTotals({ lines: lines(SERUM) }).vatRateBps).toBe(2000);
  });

  it("porte aussi sur les frais de port, qui sont taxés", () => {
    const t = computeTotals({
      lines: lines(SERUM),
      shipping: { priceCents: 590 },
    });

    expect(t.totalCents).toBe(5490);
    expect(t.taxCents).toBe(taxIncludedIn(5490));
  });
});

describe("remise", () => {
  it("applique un pourcentage sur le sous-total", () => {
    const t = computeTotals({
      lines: lines(SERUM, CREME), // 8700
      discount: { code: "FORGE10", type: "PERCENT", value: 1000 },
    });

    expect(t.discountCents).toBe(870);
    expect(t.totalCents).toBe(7830);
    expect(t.discountCode).toBe("FORGE10");
  });

  it("arrondit le pourcentage au centime, sans traîner de flottant", () => {
    const t = computeTotals({
      lines: lines({ productId: "p", unitPriceCents: 3333, qty: 1 }),
      discount: { code: "P15", type: "PERCENT", value: 1500 },
    });

    // 3333 × 0,15 = 499,95
    expect(t.discountCents).toBe(500);
    expect(Number.isInteger(t.totalCents)).toBe(true);
  });

  it("applique une remise fixe", () => {
    const t = computeTotals({
      lines: lines(SERUM, CREME),
      discount: { code: "MOINS10", type: "FIXED", value: 1000 },
    });

    expect(t.discountCents).toBe(1000);
    expect(t.totalCents).toBe(7700);
  });

  it("plafonne la remise au montant remisable : jamais de total négatif", () => {
    const t = computeTotals({
      lines: lines(NETTOYANT), // 2400
      discount: { code: "MOINS50", type: "FIXED", value: 5000 },
    });

    expect(t.discountCents).toBe(2400);
    expect(t.totalCents).toBe(0);
  });

  it("refuse la remise sous le minimum de commande, et le dit", () => {
    const t = computeTotals({
      lines: lines(NETTOYANT), // 2400
      discount: {
        code: "DES60",
        type: "FIXED",
        value: 1000,
        minOrderCents: 6000,
      },
    });

    expect(t.discountCents).toBe(0);
    expect(t.discountRejectedFor).toBe("BELOW_MINIMUM");
    expect(t.discountCode).toBeNull();
  });

  it("juge le minimum sur le panier entier, pas sur la seule ligne ciblée", () => {
    const t = computeTotals({
      lines: lines(NETTOYANT, SERUM, CREME), // 11 100
      discount: {
        code: "SERUM20",
        type: "PERCENT",
        value: 2000,
        minOrderCents: 6000,
        productId: "p-serum",
      },
    });

    expect(t.discountRejectedFor).toBeNull();
    expect(t.discountCents).toBe(980); // 20 % de 4900, pas du panier
  });

  it("ignore une remise ciblée sur un produit absent du panier", () => {
    const t = computeTotals({
      lines: lines(NETTOYANT),
      discount: { code: "SERUM20", type: "PERCENT", value: 2000, productId: "p-serum" },
    });

    expect(t.discountCents).toBe(0);
    expect(t.discountRejectedFor).toBe("NOT_APPLICABLE");
  });
});

describe("ventilation de la remise sur les lignes", () => {
  it("répartit au prorata du poids de chaque ligne", () => {
    const t = computeTotals({
      lines: lines(SERUM, CREME), // 4900 + 3800 = 8700
      discount: { code: "P10", type: "PERCENT", value: 1000 },
    });

    expect(t.discountCents).toBe(870);
    expect(t.lines[0].discountCents).toBe(490);
    expect(t.lines[1].discountCents).toBe(380);
  });

  it("ne perd ni n'invente un centime, même sur un montant indivisible", () => {
    // 10 centimes sur trois lignes égales : 3,33 chacune. Une ventilation
    // naïve rendrait 3+3+3 = 9, et la facture serait fausse de 1 centime.
    const t = computeTotals({
      lines: lines(
        { productId: "a", unitPriceCents: 1000, qty: 1 },
        { productId: "b", unitPriceCents: 1000, qty: 1 },
        { productId: "c", unitPriceCents: 1000, qty: 1 },
      ),
      discount: { code: "DIX", type: "FIXED", value: 10 },
    });

    const sum = t.lines.reduce((n, l) => n + l.discountCents, 0);
    expect(sum).toBe(t.discountCents);
    expect(t.lines.map((l) => l.discountCents)).toEqual([4, 3, 3]);
  });

  it("garantit que la somme des lignes nettes égale le total hors livraison", () => {
    const t = computeTotals({
      lines: lines(
        { ...SERUM, qty: 3 },
        { ...CREME, qty: 2 },
        { ...NETTOYANT, qty: 1 },
      ),
      discount: { code: "P17", type: "PERCENT", value: 1700 },
      shipping: { priceCents: 590 },
    });

    const net = t.lines.reduce((n, l) => n + l.netCents, 0);
    expect(net).toBe(t.subtotalCents - t.discountCents);
    expect(t.totalCents).toBe(net + t.shippingCents);
  });

  it("ne ventile que sur les lignes éligibles d'une remise produit", () => {
    const t = computeTotals({
      lines: lines(SERUM, CREME),
      discount: { code: "SERUM20", type: "PERCENT", value: 2000, productId: "p-serum" },
    });

    expect(t.lines[0].discountCents).toBe(980);
    expect(t.lines[1].discountCents).toBe(0);
    expect(t.lines[1].netCents).toBe(3800);
  });

  it("rend le bon montant pour le remboursement partiel d'une ligne remisée", () => {
    // Deuxième definition of done : rembourser la crème d'un panier remisé de
    // 10 % rend 3420, pas 3800 — le client n'a jamais payé 3800.
    const t = computeTotals({
      lines: lines(SERUM, CREME),
      discount: { code: "P10", type: "PERCENT", value: 1000 },
    });

    const creme = t.lines.find((l) => l.productId === "p-creme")!;
    expect(creme.netCents).toBe(3420);
    expect(taxIncludedIn(creme.netCents)).toBe(570);
  });
});

describe("livraison", () => {
  it("reste inconnue tant qu'aucun mode n'est choisi", () => {
    const t = computeTotals({ lines: lines(SERUM) });

    expect(t.shippingKnown).toBe(false);
    expect(t.shippingCents).toBe(0);
  });

  it("s'ajoute au total une fois le mode choisi", () => {
    const t = computeTotals({
      lines: lines(NETTOYANT),
      shipping: { priceCents: 490 },
    });

    expect(t.shippingKnown).toBe(true);
    expect(t.totalCents).toBe(2890);
  });

  it("offre la livraison au-dessus du franco", () => {
    const t = computeTotals({
      lines: lines(SERUM, CREME), // 8700
      shipping: { priceCents: 590, freeAboveCents: 6000 },
    });

    expect(t.freeShipping).toBe(true);
    expect(t.shippingCents).toBe(0);
  });

  it("juge le franco APRÈS la remise, pas sur le sous-total", () => {
    // 8700 dépasse 6000, mais le client ne paie que 5220 : lui offrir le port
    // reviendrait à financer sa remise deux fois.
    const t = computeTotals({
      lines: lines(SERUM, CREME),
      discount: { code: "P40", type: "PERCENT", value: 4000 },
      shipping: { priceCents: 590, freeAboveCents: 6000 },
    });

    expect(t.subtotalCents).toBe(8700);
    expect(t.discountCents).toBe(3480);
    expect(t.freeShipping).toBe(false);
    expect(t.shippingCents).toBe(590);
    expect(t.totalCents).toBe(5810);
  });

  it("offre la livraison sur un code FREE_SHIPPING sans toucher aux produits", () => {
    const t = computeTotals({
      lines: lines(NETTOYANT),
      discount: { code: "PORTOFFERT", type: "FREE_SHIPPING", value: 0 },
      shipping: { priceCents: 590 },
    });

    expect(t.discountCents).toBe(0);
    expect(t.freeShipping).toBe(true);
    expect(t.shippingCents).toBe(0);
    expect(t.totalCents).toBe(2400);
    expect(t.discountCode).toBe("PORTOFFERT");
  });

  it("ne facture pas le port d'un panier vide", () => {
    const t = computeTotals({
      lines: [],
      shipping: { priceCents: 590 },
    });

    expect(t.shippingCents).toBe(0);
    expect(t.totalCents).toBe(0);
  });
});

describe("stabilité", () => {
  it("rend exactement le même résultat sur deux appels — panier puis Stripe", () => {
    // Première definition of done : le total affiché est celui débité.
    const input = {
      lines: lines({ ...SERUM, qty: 2 }, { ...CREME, qty: 3 }, NETTOYANT),
      discount: { code: "P13", type: "PERCENT" as const, value: 1300 },
      shipping: { priceCents: 590, freeAboveCents: 12_000 },
    };

    expect(computeTotals(input)).toEqual(computeTotals(input));
  });

  it("ne modifie pas les lignes qu'on lui passe", () => {
    const original = [{ ...SERUM }];
    computeTotals({
      lines: original,
      discount: { code: "P10", type: "PERCENT", value: 1000 },
    });

    expect(original[0]).toEqual(SERUM);
  });
});
