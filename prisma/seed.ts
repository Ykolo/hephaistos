import { PrismaClient, type ImageRole } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Seed — amorce une base vide avec le catalogue de lancement.
 *
 * Les données vivent ici et **plus** dans `src/lib/products.ts`, vidé par
 * HEP-45 : le catalogue n'a plus qu'une source de vérité, la base. Ce fichier
 * n'est jamais inclus dans le bundle client, c'est donc le bon endroit pour
 * des données d'amorçage.
 *
 * Le contenu éditorial (noms, descriptions, bénéfices, usage, INCI, images)
 * est repris tel quel du site en production : rien n'est inventé.
 *
 * ⚠️ EN ATTENTE DE VALIDATION — trois champs n'ont aucune source et sont des
 * valeurs d'attente, marquées `PROVISIONAL` pour être retrouvées d'un grep :
 *   - `sku`         : format provisoire (cadrage Anita, HEP-33)
 *   - `volumeMl`    : conditionnement réel (fiche fournisseur)
 *   - `weightGrams` : poids emballé, dont dépend tout le tarif Sendcloud (lot 7)
 */

const CDN = "https://hephaistosparis.com/cdn/shop/files";

type SeedProduct = {
  slug: string;
  name: string;
  category: "CLEANSING" | "TREATMENT" | "HYDRATION";
  priceCents: number;
  tagline: string;
  description: string;
  benefits: string[];
  usage: string;
  inci: string;
  image: string;
  imageHover: string;
  /** PROVISIONAL — à confirmer avant toute mise en vente. */
  sku: string;
  /** PROVISIONAL */
  volumeMl: number;
  /** PROVISIONAL */
  weightGrams: number;
};

const catalogue: SeedProduct[] = [
  {
    slug: "nettoyant",
    name: "Nettoyant Visage",
    category: "CLEANSING",
    priceCents: 1500,
    tagline: "Purifie sans agresser",
    description:
      "Le premier geste du rituel. Une mousse nettoyante qui élimine impuretés, excès de sébum et pollution sans agresser la barrière cutanée. La peau est nette, fraîche, prête à recevoir le soin.",
    benefits: [
      "Élimine impuretés et excès de sébum",
      "Respecte la barrière cutanée",
      "Fini frais et net, sans tiraillement",
      "Adapté à un usage quotidien matin et soir",
    ],
    usage:
      "Matin et soir, faire mousser une petite quantité entre les mains humides, masser le visage en évitant le contour des yeux, puis rincer à l'eau claire.",
    inci: "Aqua, Sodium Cocoyl Glycinate, Glycerin, Coco-Betaine… (liste INCI complète à intégrer depuis la fiche fournisseur).",
    image: `${CDN}/image_5.webp?v=1782162488&width=1200`,
    imageHover: `${CDN}/hf_20260618_130056_b8de04a8-0778-418a-bc29-44644f6f5cb9.jpg?v=1781788244&width=1200`,
    sku: "HEP-NET-001-150",
    volumeMl: 150,
    weightGrams: 200,
  },
  {
    slug: "serum",
    name: "Sérum Régulateur de Sébum",
    category: "TREATMENT",
    priceCents: 2000,
    tagline: "Équilibre — matifie sans assécher",
    description:
      "Le cœur du rituel. Un sérum léger qui régule la production de sébum et resserre l'aspect des pores. La peau est matifiée, équilibrée, sans effet desséchant.",
    benefits: [
      "Régule l'excès de sébum",
      "Matifie la zone T",
      "Affine l'aspect des pores",
      "Texture légère, pénétration rapide",
    ],
    usage:
      "Matin et/ou soir sur peau propre et sèche, appliquer quelques gouttes sur le visage et masser jusqu'à absorption, avant la crème hydratante.",
    inci: "Aqua, Niacinamide, Zinc PCA, Glycerin… (liste INCI complète à intégrer depuis la fiche fournisseur).",
    image: `${CDN}/image_1.webp?v=1782161694&width=1200`,
    imageHover: `${CDN}/hf_20260618_125354_856d9c75-68cf-4560-9867-c25c0e38c6d5.png?v=1781788175&width=1200`,
    sku: "HEP-SER-001-030",
    volumeMl: 30,
    weightGrams: 80,
  },
  {
    slug: "creme",
    name: "Crème Hydratante Légère",
    category: "HYDRATION",
    priceCents: 2000,
    tagline: "Hydrate, jamais gras",
    description:
      "Le geste final. Une crème légère qui hydrate durablement sans laisser de film gras. La peau est souple, confortable, protégée tout au long de la journée.",
    benefits: [
      "Hydratation longue durée",
      "Fini non gras, absorption rapide",
      "Apaise et assouplit la peau",
      "Base idéale avant le rasage ou la journée",
    ],
    usage:
      "Matin et soir, appliquer une noisette sur l'ensemble du visage après le sérum, masser délicatement jusqu'à pénétration complète.",
    inci: "Aqua, Glycerin, Caprylic/Capric Triglyceride, Squalane… (liste INCI complète à intégrer depuis la fiche fournisseur).",
    image: `${CDN}/image_4.webp?v=1782162138&width=1200`,
    imageHover: `${CDN}/hf_20260618_125819_66b9e5b2-01ad-41e0-9ac5-0158de0617ad.png?v=1781788133&width=1200`,
    sku: "HEP-CRE-001-050",
    volumeMl: 50,
    weightGrams: 120,
  },
];

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL ou DATABASE_URL est requis pour le seed.");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  for (const [index, p] of catalogue.entries()) {
    const data = {
      sku: p.sku,
      name: p.name,
      tagline: p.tagline,
      description: p.description,
      category: p.category,
      priceCents: p.priceCents,
      volumeMl: p.volumeMl,
      weightGrams: p.weightGrams,
      // Le site annonce « Bientôt disponible » sur les trois produits :
      // publié mais pas encore vendable, stock à zéro.
      status: "PUBLISHED",
      availability: "COMING_SOON",
      stock: 0,
      usage: p.usage,
      inci: p.inci,
      position: index,
    } as const;

    const product = await db.product.upsert({
      where: { slug: p.slug },
      update: data,
      create: { slug: p.slug, ...data },
    });

    // Bénéfices et images sont remplacés en bloc : le seed doit être rejouable
    // sans accumuler de doublons.
    await db.productBenefit.deleteMany({ where: { productId: product.id } });
    await db.productBenefit.createMany({
      data: p.benefits.map((label, position) => ({
        productId: product.id,
        label,
        position,
      })),
    });

    const images: { blobUrl: string; role: ImageRole; position: number }[] = [
      { blobUrl: p.image, role: "PRIMARY", position: 0 },
      { blobUrl: p.imageHover, role: "HOVER", position: 1 },
    ];
    await db.productImage.deleteMany({ where: { productId: product.id } });
    await db.productImage.createMany({
      data: images.map((img) => ({ ...img, productId: product.id, alt: p.name })),
    });

    console.log(`✓ ${p.name} — ${(p.priceCents / 100).toFixed(2)} € (${p.sku})`);
  }

  // --- Le coffret (HEP-40) --------------------------------------------------
  // Produit composé : il n'a pas de stock propre, il consomme celui des trois
  // références. Créé en BROUILLON et au prix exact de la somme des composants
  // (55 €) : le prix d'une offre coffret est une décision commerciale, pas un
  // calcul, et il n'a pas encore été pris. Publier un prix inventé serait pire
  // que ne rien publier.
  const coffret = await db.product.upsert({
    where: { slug: "coffret" },
    update: {},
    create: {
      slug: "coffret",
      sku: "HEP-COF-001", // PROVISIONAL
      name: "Le Coffret",
      tagline: "Le rituel complet",
      description:
        "Les trois gestes réunis : nettoyer, réguler, hydrater. Le rituel complet en un seul coffret.",
      category: "TREATMENT",
      kind: "BUNDLE",
      priceCents: 5500, // PROVISIONAL — somme des composants, sans remise
      weightGrams: 400, // PROVISIONAL — somme + emballage du coffret
      status: "DRAFT",
      availability: "COMING_SOON",
      stock: 0, // jamais utilisé pour un coffret : le stock est calculé
      position: catalogue.length,
    },
  });

  const components = await db.product.findMany({
    where: { slug: { in: catalogue.map((p) => p.slug) } },
    select: { id: true },
  });

  await db.bundleComponent.deleteMany({ where: { bundleId: coffret.id } });
  await db.bundleComponent.createMany({
    data: components.map((c) => ({
      bundleId: coffret.id,
      componentId: c.id,
      qty: 1,
    })),
  });

  console.log(
    `✓ Le Coffret — 55.00 € (brouillon, ${components.length} composants)`,
  );

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

  console.log(`\nBase prête : ${await db.product.count()} produits.`);
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
