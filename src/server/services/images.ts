import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Tx } from "../db";
import { ActionError } from "../errors";
import { getStorage } from "../storage";
import type { ImageRole } from "@/generated/prisma/client";

/**
 * Images produit — validation, conversion, stockage (HEP-43).
 *
 * Le site servait ses photos depuis le CDN Shopify. Shopify étant abandonné,
 * ces URL peuvent disparaître du jour au lendemain et le site perdrait toutes
 * ses images.
 */

/** 10 Mo. Au-delà, c'est un fichier envoyé par erreur, pas une photo produit. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Largeurs générées, alignées sur les `sizes` déjà utilisées par le front. */
export const WIDTHS = [1024, 1200, 1600] as const;

/**
 * Type réel du fichier, lu dans ses **premiers octets**.
 *
 * L'extension et le `Content-Type` déclaré viennent du client : un `.jpg` peut
 * contenir n'importe quoi. Seule la signature binaire dit la vérité, et c'est
 * elle qui décide si le fichier entre dans le pipeline.
 */
export function sniffImageType(buf: Buffer): "jpeg" | "png" | "webp" | null {
  if (buf.length < 12) return null;

  // JPEG : FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";

  // PNG : 89 50 4E 47 0D 0A 1A 0A
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => buf[i] === b)) return "png";

  // WebP : "RIFF" .... "WEBP"
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }

  return null;
}

/**
 * Nom de fichier, **toujours** généré côté serveur.
 *
 * Reprendre celui fourni par l'utilisateur ouvrirait la traversée de chemin
 * (`../../`), l'écrasement d'un fichier existant par collision de nom, et
 * exposerait des noms internes. Le slug produit ne sert qu'à rendre l'URL
 * lisible ; l'unicité vient de l'UUID.
 */
export function buildPathname(slug: string, width: number): string {
  const safeSlug = slug.replace(/[^a-z0-9-]/g, "").slice(0, 40) || "produit";
  return `produits/${safeSlug}/${randomUUID()}-${width}.webp`;
}

export type ProcessedImage = {
  url: string;
  width: number;
};

/**
 * Valide, convertit en WebP et stocke une image dans les trois largeurs.
 *
 * Une image plus petite que la largeur cible n'est **pas** agrandie : un
 * upscale produit un fichier plus lourd et plus flou que l'original.
 */
export async function processAndStore(
  buf: Buffer,
  slug: string,
): Promise<ProcessedImage[]> {
  if (buf.byteLength > MAX_UPLOAD_BYTES) {
    throw new ActionError(
      "VALIDATION",
      `L'image dépasse ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo.`,
    );
  }

  const kind = sniffImageType(buf);
  if (!kind) {
    throw new ActionError(
      "VALIDATION",
      "Ce fichier n'est pas une image JPG, PNG ou WebP.",
    );
  }

  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) {
    throw new ActionError("VALIDATION", "Cette image est illisible.");
  }

  const storage = getStorage();
  const targets = WIDTHS.filter((w) => w <= meta.width!);
  // Image plus petite que la plus petite largeur cible : on la garde telle
  // quelle plutôt que de la refuser.
  if (targets.length === 0) targets.push(meta.width as (typeof WIDTHS)[number]);

  const out: ProcessedImage[] = [];
  for (const width of targets) {
    const webp = await sharp(buf)
      .rotate() // applique l'orientation EXIF, sinon les photos de téléphone basculent
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const stored = await storage.put(
      buildPathname(slug, width),
      webp,
      "image/webp",
    );
    out.push({ url: stored.url, width });
  }

  return out;
}

/**
 * Enregistre une image sur un produit.
 *
 * `alt` est **obligatoire** : une image sans texte alternatif est invisible
 * pour un lecteur d'écran et muette pour un moteur de recherche. Le rendre
 * facultatif garantit qu'il ne sera jamais rempli.
 */
export async function attachImage(
  db: Tx,
  params: {
    productSlug: string;
    buffer: Buffer;
    alt: string;
    role: ImageRole;
  },
): Promise<{ url: string; count: number }> {
  const alt = params.alt.trim();
  if (!alt) {
    throw new ActionError(
      "VALIDATION",
      "Le texte alternatif est obligatoire.",
      { alt: "Décrivez l'image en quelques mots." },
    );
  }

  const product = await db.product.findUnique({
    where: { slug: params.productSlug },
    select: { id: true },
  });
  if (!product) throw new ActionError("NOT_FOUND", "Ce produit est introuvable.");

  const variants = await processAndStore(params.buffer, params.productSlug);
  // La plus grande largeur sert de source : `next/image` se charge du reste.
  const primary = variants[variants.length - 1];

  const last = await db.productImage.aggregate({
    where: { productId: product.id },
    _max: { position: true },
  });

  // Un seul PRIMARY et un seul HOVER par produit : le nouveau rétrograde
  // l'ancien en GALLERY plutôt que de créer un doublon silencieux.
  if (params.role === "PRIMARY" || params.role === "HOVER") {
    await db.productImage.updateMany({
      where: { productId: product.id, role: params.role },
      data: { role: "GALLERY" },
    });
  }

  await db.productImage.create({
    data: {
      productId: product.id,
      blobUrl: primary.url,
      alt,
      role: params.role,
      position: (last._max.position ?? -1) + 1,
    },
  });

  return { url: primary.url, count: variants.length };
}

/**
 * Retire une image d'un produit **et** du stockage.
 *
 * Sans la seconde partie, on paierait indéfiniment du stockage pour des
 * fichiers que plus rien ne référence.
 */
export async function detachImage(db: Tx, imageId: string): Promise<void> {
  const image = await db.productImage.findUnique({
    where: { id: imageId },
    select: { id: true, blobUrl: true },
  });
  if (!image) throw new ActionError("NOT_FOUND", "Cette image est introuvable.");

  await db.productImage.delete({ where: { id: image.id } });

  // La ligne part en premier : si le stockage échoue, on préfère un fichier
  // orphelin qu'une fiche produit pointant vers une image supprimée.
  await getStorage().delete(image.blobUrl);
}

/** Réordonne les images d'un produit. */
export async function reorderImages(
  db: Tx,
  productSlug: string,
  imageIds: string[],
): Promise<void> {
  const product = await db.product.findUnique({
    where: { slug: productSlug },
    select: { id: true },
  });
  if (!product) throw new ActionError("NOT_FOUND", "Ce produit est introuvable.");

  await Promise.all(
    imageIds.map((id, position) =>
      db.productImage.updateMany({
        where: { id, productId: product.id },
        data: { position },
      }),
    ),
  );
}

/** Images d'un produit, pour l'écran d'administration. */
export async function listImages(db: Tx, productSlug: string) {
  return db.productImage.findMany({
    where: { product: { slug: productSlug } },
    orderBy: { position: "asc" },
    select: { id: true, blobUrl: true, alt: true, role: true, position: true },
  });
}
