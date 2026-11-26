import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildRobots,
  buildSitemap,
  canonicalOrigin,
  isIndexable,
  isPrivatePath,
  PRIVATE_PATHS,
} from "@/lib/seo";
import { sitemapSource } from "@/server/services/catalog";
import { cleanupTestProducts, createTestProduct, testDb } from "./helpers/db";

/** Sitemap et robots (HEP-97). */

const PROD = { VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "hephaistosparis.com" };
const PREVIEW = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "hephaistosparis.com" };

beforeEach(cleanupTestProducts);
afterAll(async () => {
  await cleanupTestProducts();
  await testDb.$disconnect();
});

describe("robots.txt", () => {
  it("en production : chemins privés interdits et sitemap annoncé sur le vrai domaine", () => {
    const robots = buildRobots(PROD);
    expect(robots.rules).toEqual({ userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] });
    expect(robots.sitemap).toBe("https://hephaistosparis.com/sitemap.xml");
  });

  it("en preview et en local : tout est fermé, sans sitemap à suivre", () => {
    for (const env of [PREVIEW, {}]) {
      const robots = buildRobots(env);
      expect(robots.rules).toEqual({ userAgent: "*", disallow: "/" });
      expect(robots.sitemap).toBeUndefined();
      expect(isIndexable(env)).toBe(false);
    }
  });

  it("l'origine canonique ignore un localhost recopié sur Vercel", () => {
    expect(canonicalOrigin({ ...PROD, NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })).toBe("https://hephaistosparis.com");
    expect(canonicalOrigin({ ...PROD, NEXT_PUBLIC_SITE_URL: "https://www.hephaistosparis.com/" })).toBe(
      "https://www.hephaistosparis.com",
    );
    expect(canonicalOrigin({})).toBe("http://localhost:3000");
  });

  it("chemins privés : préfixes exacts, sans attraper un voisin", () => {
    for (const path of ["/admin", "/admin/commandes", "/compte", "/compte/commandes", "/panier", "/api/health", "/commande/abc", "/desinscription", "/newsletter/confirmation"]) {
      expect(isPrivatePath(path), path).toBe(true);
    }
    for (const path of ["/", "/boutique", "/produit/serum", "/newsletter", "/administrateur-du-gout"]) {
      expect(isPrivatePath(path), path).toBe(false);
    }
  });
});

describe("sitemap.xml", () => {
  const origin = "https://hephaistosparis.com";

  it("les dates viennent des données, jamais du build ; une page sans source n'en a pas", () => {
    const old = new Date("2026-10-01T00:00:00Z");
    const recent = new Date("2026-11-20T00:00:00Z");
    const legal = new Date("2026-11-25T00:00:00Z");
    const map = buildSitemap({
      origin,
      products: [
        { slug: "serum", updatedAt: old },
        { slug: "creme", updatedAt: recent },
      ],
      legalUpdatedAt: legal,
    });
    const byUrl = Object.fromEntries(map.map((e) => [e.url, e.lastModified]));
    expect(byUrl[origin]).toEqual(recent);
    expect(byUrl[`${origin}/boutique`]).toEqual(recent);
    expect(byUrl[`${origin}/produit/serum`]).toEqual(old);
    expect(byUrl[`${origin}/legal`]).toEqual(legal);
    expect(byUrl[`${origin}/histoire`]).toBeUndefined();
  });

  it("aucune URL privée", () => {
    const map = buildSitemap({ origin, products: [{ slug: "serum", updatedAt: new Date() }] });
    for (const entry of map) expect(isPrivatePath(new URL(entry.url).pathname), entry.url).toBe(false);
    expect(map.some((e) => e.url.includes("/panier"))).toBe(false);
  });

  it("publier un produit l'y fait entrer, l'archiver l'en retire", async () => {
    const p = await createTestProduct({ stock: 1 });
    const slugs = async () => (await sitemapSource(testDb)).products.map((x) => x.slug);

    expect(await slugs()).toContain(p.slug);

    await testDb.product.update({ where: { id: p.id }, data: { status: "ARCHIVED" } });
    expect(await slugs()).not.toContain(p.slug);

    await testDb.product.update({ where: { id: p.id }, data: { status: "DRAFT" } });
    expect(await slugs()).not.toContain(p.slug);
  });
});
