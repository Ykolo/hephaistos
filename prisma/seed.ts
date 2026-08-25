import { PrismaClient, type ImageRole } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { products, type Product } from "../src/lib/products";

/**
 * Seed — reconstruit une base vide à l'identique du catalogue affiché.
 *
 * Le contenu éditorial (noms, descriptions, bénéfices, usage, INCI, images)
 * est repris tel quel de `src/lib/products.ts`, qui alimente le site
 * aujourd'hui : rien n'est inventé ici.
 *
 * ⚠️ EN ATTENTE DE VALIDATION — les champs ci-dessous n'existent nulle part
 * dans le front et sont des valeurs d'attente, à confirmer avant toute
 * mise en vente :
 *   - `sku`         : format provisoire HEP-XXX-001-<volume> (cadrage Anita, HEP-33)
 *   - `volumeMl`    : conditionnement réel (fiche fournisseur)
 *   - `weightGrams` : poids emballé, dont dépend tout le tarif Sendcloud (lot 7)
 * Elles sont marquées `PROVISIONAL` pour être retrouvées d'un grep.
 */

const PROVISIONAL = {
  nettoyant: { sku: "HEP-NET-001-150", volumeMl: 150, weightGrams: 200 },
  serum: { sku: "HEP-SER-001-030", volumeMl: 30, weightGrams: 80 },
  creme: { sku: "HEP-CRE-001-050", volumeMl: 50, weightGrams: 120 },
} as const;

const CATEGORY = {
  Nettoyage: "CLEANSING",
  "Soin ciblé": "TREATMENT",
  Hydratation: "HYDRATION",
} as const;

/** `price: "15"` (euros, string) côté front → centimes en base. */
function toCents(price: string): number {
  const cents = Math.round(Number(price) * 100);
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error(`Prix illisible dans products.ts : "${price}"`);
  }
  return cents;
}

function imagesOf(p: Product) {
  // `img` et `imgHover` réapparaissent dans `gallery` : on déduplique en
  // gardant le premier rôle rencontré, sinon la fiche produit affiche deux
  // fois la même photo.
  const seen = new Set<string>();
  const rows: { blobUrl: string; alt: string; role: ImageRole; position: number }[] = [];

  const push = (url: string, role: ImageRole) => {
    const key = url.split("?")[0];
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ blobUrl: url, alt: p.name, role, position: rows.length });
  };

  push(p.img, "PRIMARY");
  push(p.imgHover, "HOVER");
  p.gallery.forEach((url) => push(url, "GALLERY"));
  return rows;
}

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL ou DATABASE_URL est requis pour le seed.");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  for (const [index, p] of products.entries()) {
    const extra = PROVISIONAL[p.id as keyof typeof PROVISIONAL];
    if (!extra) throw new Error(`Aucune donnée provisoire pour le produit "${p.id}".`);

    const data = {
      sku: extra.sku,
      name: p.name,
      tagline: p.tagline,
      description: p.desc,
      category: CATEGORY[p.cat],
      priceCents: toCents(p.price),
      volumeMl: extra.volumeMl,
      weightGrams: extra.weightGrams,
      // Le site annonce « Bientôt disponible » sur les trois produits :
      // publié mais pas encore vendable, stock à zéro.
      status: "PUBLISHED",
      availability: "COMING_SOON",
      stock: 0,
      usage: p.usage,
      inci: p.inci,
      position: index,
    } as const;

    await db.product.upsert({
      where: { slug: p.id },
      update: data,
      create: { slug: p.id, ...data },
    });

    // Bénéfices et images sont remplacés en bloc : le seed doit être
    // rejouable sans accumuler de doublons.
    const product = await db.product.findUniqueOrThrow({ where: { slug: p.id } });

    await db.productBenefit.deleteMany({ where: { productId: product.id } });
    await db.productBenefit.createMany({
      data: p.benefits.map((label, position) => ({ productId: product.id, label, position })),
    });

    await db.productImage.deleteMany({ where: { productId: product.id } });
    await db.productImage.createMany({
      data: imagesOf(p).map((img) => ({ ...img, productId: product.id })),
    });

    console.log(`✓ ${p.name} — ${(data.priceCents / 100).toFixed(2)} € (${data.sku})`);
  }

  // Réglages entreprise : une seule ligne, alimente factures et mentions
  // légales (HEP-80). Les valeurs réelles (SIRET, TVA, capital) sont encore
  // attendues de Jules — cf. docs/BACKEND.md §6.
  await db.companySettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      legalName: "Héphaïstos Paris",
      address: { line1: "À compléter", postalCode: "", city: "Paris", country: "FR" },
      siret: "PROVISIONAL",
      vatNumber: "PROVISIONAL",
      contactEmail: "contact@hephaistosparis.com",
    },
  });

  const count = await db.product.count();
  console.log(`\nBase prête : ${count} produits.`);
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
