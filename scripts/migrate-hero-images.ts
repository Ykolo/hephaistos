import { promises as fs } from "node:fs";
import { processAndStore } from "../src/server/services/images";
import { storageDriver } from "../src/server/storage";
import { heroImages } from "../src/lib/content";

/**
 * Migration des visuels éditoriaux hors du CDN Shopify (HEP-43).
 *
 * Complément de `migrate-images.ts`, qui ne traite que les `ProductImage` en
 * base. Ces quatre visuels — dont le hero de l'accueil — vivent en dur dans
 * `src/lib/content.ts` et seraient restés sur Shopify, c'est-à-dire sur une
 * plateforme abandonnée qui peut couper ces URL sans préavis.
 *
 * Le script réécrit `content.ts` avec les nouvelles URL. Idempotent : les
 * entrées déjà migrées sont ignorées.
 *
 *   bun run images:migrate-hero
 */

const SHOPIFY = /\/cdn\/shop\//;
const TARGET = "src/lib/content.ts";

async function main() {
  console.log(`Stockage cible : ${storageDriver()}\n`);

  const todo = Object.entries(heroImages).filter(([, url]) => SHOPIFY.test(url));
  if (todo.length === 0) {
    console.log("Rien à migrer — plus aucune URL cdn/shop dans content.ts.");
    return;
  }

  let source = await fs.readFile(TARGET, "utf8");
  const migrated: Record<string, string> = {};

  for (const [key, url] of todo) {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`✗ ${key.padEnd(10)} HTTP ${res.status} — laissé en place`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const variants = await processAndStore(buf, `editorial-${key}`);
    const biggest = variants[variants.length - 1];

    migrated[key] = biggest.url;
    console.log(`✓ ${key.padEnd(10)} → ${biggest.url}`);
  }

  if (Object.keys(migrated).length === 0) {
    console.error("\nAucune image migrée.");
    process.exitCode = 1;
    return;
  }

  // Remplacement littéral de chaque ancienne URL : plus sûr qu'une
  // reconstruction du bloc, qui écraserait les commentaires alentour.
  for (const [key, newUrl] of Object.entries(migrated)) {
    const oldUrl = heroImages[key as keyof typeof heroImages];
    // L'URL est écrite sous forme de gabarit `${CDN}/...` : on remplace la
    // ligne entière de la clé concernée.
    const line = new RegExp(`(\\s+${key}:\\s*)\`[^\`]*\`,`);
    if (!line.test(source)) {
      console.error(`✗ ${key} : ligne introuvable dans ${TARGET}`);
      continue;
    }
    source = source.replace(line, `$1"${newUrl}",`);
    void oldUrl;
  }

  await fs.writeFile(TARGET, source);
  console.log(`\n${Object.keys(migrated).length} visuel(s) migré(s), ${TARGET} mis à jour.`);
  console.log("Vérifiez le diff avant de commiter.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
