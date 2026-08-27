import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { processAndStore } from "../src/server/services/images";
import { storageDriver } from "../src/server/storage";

/**
 * Migration des images produit hors du CDN Shopify (HEP-43).
 *
 * Le site sert aujourd'hui ses photos depuis `hephaistosparis.com/cdn/shop`.
 * Shopify étant abandonné, ces URL peuvent disparaître sans préavis et le site
 * perdrait toutes ses images.
 *
 * Le script est **idempotent** : il ne touche qu'aux `ProductImage` dont
 * l'URL pointe encore vers Shopify, et peut donc être relancé sans risque
 * après une interruption.
 *
 *   bun run images:migrate            # migre
 *   bun run images:migrate -- --dry   # liste sans rien écrire
 */

const SHOPIFY = /\/cdn\/shop\//;
const DRY = process.argv.includes("--dry");

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL est requis.");

  const adapter = /neon\.(tech|build)/.test(url)
    ? new PrismaNeon({ connectionString: url })
    : new PrismaPg({ connectionString: url });
  const db = new PrismaClient({ adapter });

  const images = await db.productImage.findMany({
    select: {
      id: true,
      blobUrl: true,
      alt: true,
      product: { select: { slug: true } },
    },
    orderBy: { position: "asc" },
  });

  const todo = images.filter((i) => SHOPIFY.test(i.blobUrl));

  console.log(`Stockage cible : ${storageDriver()}`);
  console.log(`${images.length} images en base, ${todo.length} encore sur Shopify.\n`);

  if (todo.length === 0) {
    console.log("Rien à migrer — plus aucune URL cdn/shop.");
    await db.$disconnect();
    return;
  }

  if (DRY) {
    for (const i of todo) console.log(`  ${i.product.slug.padEnd(12)} ${i.blobUrl}`);
    console.log("\nMode --dry : rien n'a été écrit.");
    await db.$disconnect();
    return;
  }

  let ok = 0;
  const failed: { id: string; url: string; reason: string }[] = [];

  for (const image of todo) {
    try {
      const res = await fetch(image.blobUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());

      const variants = await processAndStore(buf, image.product.slug);
      const primary = variants[variants.length - 1];

      // L'URL n'est remplacée qu'une fois le nouveau fichier écrit : une
      // interruption laisse la fiche pointant vers Shopify, pas vers le vide.
      await db.productImage.update({
        where: { id: image.id },
        data: { blobUrl: primary.url },
      });

      ok++;
      console.log(`✓ ${image.product.slug.padEnd(12)} → ${primary.url}`);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      failed.push({ id: image.id, url: image.blobUrl, reason });
      console.error(`✗ ${image.product.slug.padEnd(12)} ${reason}`);
    }
  }

  console.log(`\n${ok} migrée(s), ${failed.length} en échec.`);

  if (failed.length > 0) {
    console.log(
      "\nLes lignes en échec pointent toujours vers Shopify. Relancez le " +
        "script : il ne reprendra que celles-là.",
    );
    process.exitCode = 1;
  } else {
    console.log(
      "\nPlus aucune URL cdn/shop. Le domaine Shopify peut être retiré de " +
        "next.config.ts (dernière case de HEP-43).",
    );
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
