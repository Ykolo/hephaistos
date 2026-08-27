import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decrementStock, stockFromMovements } from "@/server/services/stock";
import { shiftPreorderDate, listPreorderCustomers } from "@/server/services/catalog";
import { productFormSchema } from "@/lib/validation/product";
import { preorderNotice, formatLongDate } from "@/lib/dates";
import { cleanupTestProducts, createTestProduct, testDb } from "./helpers/db";

beforeEach(cleanupTestProducts);
afterAll(async () => {
  await cleanupTestProducts();
  await testDb.$disconnect();
});

function form(overrides: Record<string, string> = {}) {
  return {
    slug: "test-precommande",
    sku: "TEST-PRE-001",
    name: "Produit en précommande",
    description: "Une description suffisamment longue pour passer la validation.",
    category: "TREATMENT",
    kind: "SIMPLE",
    status: "PUBLISHED",
    availability: "PREORDER",
    priceCents: "20",
    volumeMl: "30",
    weightGrams: "80",
    ...overrides,
  };
}

/** Une date au format attendu par `<input type="date">`, décalée de N jours. */
function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

describe("précommande — la date est obligatoire", () => {
  it("refuse une précommande sans date d'expédition", () => {
    // L'encaissement est immédiat : vendre sans date reviendrait à encaisser
    // sans s'engager à tenir quoi que ce soit.
    const r = productFormSchema.safeParse(form());
    expect(r.success).toBe(false);
    const issue = r.error?.issues.find((i) => i.path[0] === "preorderShipsAt");
    expect(issue?.message).toContain("obligatoire");
  });

  it("accepte une précommande avec une date future", () => {
    const r = productFormSchema.safeParse(
      form({ preorderShipsAt: inDays(45) }),
    );
    expect(r.success).toBe(true);
  });

  it("refuse une date déjà passée", () => {
    // Sinon la fiche annoncerait une expédition pour un jour révolu, et le
    // délai de 30 jours courrait sans que personne ne s'en aperçoive.
    const r = productFormSchema.safeParse(
      form({ preorderShipsAt: inDays(-1) }),
    );
    expect(r.success).toBe(false);
    const issue = r.error?.issues.find((i) => i.path[0] === "preorderShipsAt");
    expect(issue?.message).toContain("passé");
  });

  it("n'exige pas de date hors précommande", () => {
    const r = productFormSchema.safeParse(
      form({ availability: "IN_STOCK" }),
    );
    expect(r.success).toBe(true);
  });

  it("tolère une date passée sur un produit qui n'est plus en précommande", () => {
    // Un produit livré garde sa date historique : la refuser bloquerait toute
    // modification ultérieure de la fiche.
    const r = productFormSchema.safeParse(
      form({ availability: "IN_STOCK", preorderShipsAt: inDays(-90) }),
    );
    expect(r.success).toBe(true);
  });
});

describe("précommande — vente à stock zéro", () => {
  it("un produit en précommande est achetable sans stock", async () => {
    const product = await createTestProduct({
      stock: 0,
      availability: "PREORDER",
    });

    const r = await testDb.$transaction((tx) =>
      decrementStock(tx, { productId: product.id, qty: 2, reason: "SALE" }),
    );

    // Le stock négatif est le compteur de précommandes : 2 unités dues.
    expect(r.remaining).toBe(-2);
    expect(await stockFromMovements(testDb, product.id)).toBe(-2);
  });

  it("un produit hors précommande reste bloqué à zéro", async () => {
    const product = await createTestProduct({
      stock: 0,
      availability: "IN_STOCK",
    });

    await expect(
      testDb.$transaction((tx) =>
        decrementStock(tx, { productId: product.id, qty: 1, reason: "SALE" }),
      ),
    ).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
  });
});

describe("précommande — mention affichée au client", () => {
  it("annonce la date en toutes lettres", () => {
    const d = new Date("2026-11-15T00:00:00Z");
    expect(preorderNotice(d)).toBe(
      `Précommande — expédition prévue le ${formatLongDate(d)}.`,
    );
    expect(preorderNotice(d)).toContain("novembre");
  });

  it("ne promet rien quand la date manque", () => {
    // Cas qui ne devrait pas exister, mais mieux vaut « à confirmer » qu'une
    // date inventée ou un « Invalid Date » affiché au client.
    expect(preorderNotice(null)).toContain("à confirmer");
    expect(preorderNotice(null)).not.toContain("Invalid");
  });
});

describe("précommande — décalage de date", () => {
  it("enregistre la nouvelle date et journalise le décalage", async () => {
    const product = await createTestProduct({
      stock: 0,
      availability: "PREORDER",
    });
    const first = new Date(inDays(30));
    await testDb.product.update({
      where: { id: product.id },
      data: { preorderShipsAt: first },
    });

    const next = new Date(inDays(60));
    const result = await shiftPreorderDate(
      testDb,
      product.slug,
      next,
      "admin-test",
    );

    expect(result.previous?.toISOString().slice(0, 10)).toBe(
      first.toISOString().slice(0, 10),
    );
    expect(result.next).toEqual(next);

    const log = await testDb.auditLog.findFirstOrThrow({
      where: { entityId: product.id, action: "preorder.shift" },
    });
    expect(log.diff).toMatchObject({ clientsAPrevenir: 0 });
  });

  it("refuse de décaler un produit qui n'est pas en précommande", async () => {
    const product = await createTestProduct({
      stock: 5,
      availability: "IN_STOCK",
    });

    await expect(
      shiftPreorderDate(testDb, product.slug, new Date(inDays(30)), "admin-test"),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("ne renvoie personne à prévenir tant qu'aucune commande n'existe", async () => {
    const product = await createTestProduct({
      stock: 0,
      availability: "PREORDER",
    });
    expect(await listPreorderCustomers(testDb, product.id)).toEqual([]);
  });
});
