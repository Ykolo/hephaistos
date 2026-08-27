import { afterAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  attachImage,
  buildPathname,
  detachImage,
  listImages,
  processAndStore,
  reorderImages,
  sniffImageType,
  MAX_UPLOAD_BYTES,
} from "@/server/services/images";
import { cleanupTestProducts, createTestProduct, testDb } from "./helpers/db";

beforeEach(cleanupTestProducts);
afterAll(async () => {
  await cleanupTestProducts();
  await testDb.$disconnect();
});

/** Une vraie image, générée à la volée — pas un fichier de fixture. */
async function makeImage(
  format: "jpeg" | "png" | "webp",
  width = 1600,
  height = 1200,
) {
  const img = sharp({
    create: { width, height, channels: 3, background: "#8b5a2b" },
  });
  return format === "jpeg"
    ? img.jpeg().toBuffer()
    : format === "png"
      ? img.png().toBuffer()
      : img.webp().toBuffer();
}

describe("détection du type réel (magic bytes)", () => {
  it("reconnaît JPEG, PNG et WebP", async () => {
    expect(sniffImageType(await makeImage("jpeg", 10, 10))).toBe("jpeg");
    expect(sniffImageType(await makeImage("png", 10, 10))).toBe("png");
    expect(sniffImageType(await makeImage("webp", 10, 10))).toBe("webp");
  });

  it("refuse un fichier qui se prétend image par son extension", () => {
    // Le cœur du contrôle : un script nommé « photo.jpg ». L'extension et le
    // Content-Type viennent du client, seuls les premiers octets font foi.
    const script = Buffer.from("#!/bin/sh\nrm -rf /\n");
    expect(sniffImageType(script)).toBeNull();
  });

  it("refuse un HTML déguisé", () => {
    expect(sniffImageType(Buffer.from("<!DOCTYPE html><script>"))).toBeNull();
  });

  it("refuse un fichier trop court pour être analysé", () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it("ne se laisse pas tromper par un en-tête RIFF sans WEBP", () => {
    // Un WAV commence aussi par RIFF : sans le second contrôle, il passerait.
    const wav = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("WAVE", "ascii"),
    ]);
    expect(sniffImageType(wav)).toBeNull();
  });
});

describe("nom de fichier généré côté serveur", () => {
  it("n'utilise jamais le nom fourni", () => {
    const p = buildPathname("serum", 1200);
    expect(p).toMatch(/^produits\/serum\/[0-9a-f-]{36}-1200\.webp$/);
  });

  it("neutralise une tentative de traversée de chemin", () => {
    const p = buildPathname("../../etc/passwd", 1024);
    expect(p).not.toContain("..");
    expect(p).not.toContain("/etc/");
  });

  it("retombe sur un nom sûr quand le slug ne donne rien", () => {
    expect(buildPathname("///", 1024)).toContain("produits/produit/");
  });

  it("deux appels ne produisent jamais le même chemin", () => {
    // Sans unicité, deux envois simultanés s'écraseraient l'un l'autre.
    expect(buildPathname("serum", 1200)).not.toBe(buildPathname("serum", 1200));
  });
});

describe("conversion et tailles", () => {
  it("produit du WebP dans les trois largeurs", async () => {
    const out = await processAndStore(await makeImage("jpeg"), "test-produit");
    expect(out.map((o) => o.width)).toEqual([1024, 1200, 1600]);
    for (const o of out) expect(o.url).toContain(".webp");
  });

  it("convertit un PNG en WebP", async () => {
    const out = await processAndStore(await makeImage("png"), "test-produit");
    expect(out.every((o) => o.url.endsWith(".webp"))).toBe(true);
  });

  it("n'agrandit pas une image plus petite que les cibles", async () => {
    // Un upscale produit un fichier plus lourd ET plus flou que l'original.
    const out = await processAndStore(
      await makeImage("jpeg", 800, 600),
      "test-produit",
    );
    expect(out.every((o) => o.width <= 800)).toBe(true);
  });

  it("refuse un fichier qui n'est pas une image", async () => {
    await expect(
      processAndStore(Buffer.from("pas une image du tout"), "test-produit"),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuse un fichier trop lourd", async () => {
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0);
    // Signature JPEG valide en tête : le refus doit venir de la taille.
    big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
    await expect(processAndStore(big, "test-produit")).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("attachement à un produit", () => {
  it("refuse une image sans texte alternatif", async () => {
    const p = await createTestProduct({ stock: 1 });
    await expect(
      attachImage(testDb, {
        productSlug: p.slug,
        buffer: await makeImage("jpeg", 200, 200),
        alt: "   ",
        role: "PRIMARY",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("enregistre l'image avec son alt et son rôle", async () => {
    const p = await createTestProduct({ stock: 1 });
    await attachImage(testDb, {
      productSlug: p.slug,
      buffer: await makeImage("jpeg", 200, 200),
      alt: "Flacon de sérum sur fond sable",
      role: "PRIMARY",
    });

    const images = await listImages(testDb, p.slug);
    expect(images).toHaveLength(1);
    expect(images[0].alt).toBe("Flacon de sérum sur fond sable");
    expect(images[0].role).toBe("PRIMARY");
  });

  it("un seul PRIMARY : le nouveau rétrograde l'ancien", async () => {
    // Deux PRIMARY laisseraient le choix de la couverture au hasard de l'ordre
    // de lecture.
    const p = await createTestProduct({ stock: 1 });
    const img = await makeImage("jpeg", 200, 200);

    await attachImage(testDb, { productSlug: p.slug, buffer: img, alt: "un", role: "PRIMARY" });
    await attachImage(testDb, { productSlug: p.slug, buffer: img, alt: "deux", role: "PRIMARY" });

    const images = await listImages(testDb, p.slug);
    expect(images.filter((i) => i.role === "PRIMARY")).toHaveLength(1);
    expect(images.find((i) => i.role === "PRIMARY")?.alt).toBe("deux");
    expect(images.find((i) => i.alt === "un")?.role).toBe("GALLERY");
  });

  it("refuse un produit inexistant", async () => {
    await expect(
      attachImage(testDb, {
        productSlug: "test-inexistant",
        buffer: await makeImage("jpeg", 100, 100),
        alt: "x",
        role: "GALLERY",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("suppression et ordre", () => {
  it("retire l'image de la base", async () => {
    const p = await createTestProduct({ stock: 1 });
    await attachImage(testDb, {
      productSlug: p.slug,
      buffer: await makeImage("jpeg", 200, 200),
      alt: "à supprimer",
      role: "GALLERY",
    });

    const [image] = await listImages(testDb, p.slug);
    await detachImage(testDb, image.id);

    expect(await listImages(testDb, p.slug)).toHaveLength(0);
  });

  it("applique un nouvel ordre", async () => {
    const p = await createTestProduct({ stock: 1 });
    const img = await makeImage("jpeg", 200, 200);
    for (const alt of ["a", "b", "c"]) {
      await attachImage(testDb, { productSlug: p.slug, buffer: img, alt, role: "GALLERY" });
    }

    const before = await listImages(testDb, p.slug);
    await reorderImages(
      testDb,
      p.slug,
      [before[2].id, before[0].id, before[1].id],
    );

    expect((await listImages(testDb, p.slug)).map((i) => i.alt)).toEqual(["c", "a", "b"]);
  });
});
