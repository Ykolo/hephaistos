import { describe, expect, it } from "vitest";
import { metaDescription, pageMetadata, productMetadata } from "@/lib/metadata";

/** Métadonnées des pages (HEP-98). Fonctions pures, sans base. */

const product = {
  slug: "serum",
  name: "Sérum Régulateur de Sébum",
  tagline: "Équilibre — matifie sans assécher",
  description: "Pensé pour les peaux mixtes à grasses, il régule l'excès de sébum.",
  seoTitle: null,
  seoDescription: null,
  image: "https://blob.example/serum.webp",
  priceCents: 2000,
  availability: "IN_STOCK",
};

describe("pages", () => {
  it("canonique sur le chemin seul : les paramètres de campagne n'en font pas une autre page", () => {
    const m = pageMetadata({ title: "Contact", description: "Écris-nous.", path: "/contact" });
    expect(m.alternates?.canonical).toBe("/contact");
    expect(m.openGraph).toMatchObject({ title: "Contact — Héphaïstos", locale: "fr_FR", siteName: "Héphaïstos", url: "/contact" });
    expect(m.twitter).toMatchObject({ card: "summary_large_image" });
    expect(m.robots).toBeUndefined();
  });

  it("noindex à la demande", () => {
    expect(pageMetadata({ title: "x", description: "y", path: "/x", noindex: true }).robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it("description bornée à 160 caractères, sans couper un mot", () => {
    const long = "mot ".repeat(80);
    const d = metaDescription(long);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d.endsWith("…")).toBe(true);
    expect(d).not.toMatch(/mo…$/);
    expect(metaDescription("  court\n texte ")).toBe("court texte");
  });
});

describe("fiche produit", () => {
  it("sans champ SEO : nom, accroche et description, image du produit, og:type product", () => {
    const m = productMetadata(product);
    expect(m.title).toBe("Sérum Régulateur de Sébum");
    expect(m.description).toBe(
      "Équilibre — matifie sans assécher. Pensé pour les peaux mixtes à grasses, il régule l'excès de sébum.",
    );
    expect(m.alternates?.canonical).toBe("/produit/serum");
    // Le JPEG 1200 × 630 généré, pas la photo WebP brute.
    expect(m.openGraph).toMatchObject({ images: [{ url: "/produit/serum/opengraph-image", alt: product.name }] });
    expect((m.openGraph as Record<string, unknown>).type).toBeUndefined();
    expect(m.other).toMatchObject({
      "og:type": "product",
      "product:price:amount": "20.00",
      "product:price:currency": "EUR",
      "product:availability": "in stock",
    });
  });

  it("les champs SEO de l'admin priment ; un champ fait d'espaces compte pour vide", () => {
    expect(productMetadata({ ...product, seoTitle: "Sérum matifiant homme", seoDescription: "Matifie." })).toMatchObject({
      title: "Sérum matifiant homme",
      description: "Matifie.",
    });
    expect(productMetadata({ ...product, seoTitle: "   " }).title).toBe(product.name);
  });

  it("une fiche presque vide garde un titre et une description", () => {
    const m = productMetadata({ ...product, tagline: null, description: "", image: "" });
    expect(m.title).toBe(product.name);
    expect(m.description).toBe(product.name);
  });

  it("une page sans image propre partage l'image de repli du site", () => {
    const m = pageMetadata({ title: "Contact", description: "x", path: "/contact" });
    expect(m.openGraph).toMatchObject({ images: [{ url: "/opengraph-image", width: 1200, height: 630 }] });
    expect(m.twitter).toMatchObject({ images: ["/opengraph-image"] });
  });
});
