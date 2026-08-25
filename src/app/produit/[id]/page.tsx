import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductDetail } from "@/components/product-detail";
import { formatPriceCompact } from "@/lib/format";
import { getProductBySlug, getProducts, getProductSlugs } from "@/server/catalog";

/**
 * Le segment s'appelle `[id]` pour ne pas casser les liens existants, mais la
 * valeur est bien le **slug** du produit.
 */
export async function generateStaticParams() {
  const slugs = await getProductSlugs();
  return slugs.map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductBySlug(id);
  if (!product) return { title: "Produit introuvable | Héphaïstos" };

  // Les champs SEO de la base priment quand ils sont renseignés ; sinon on
  // retombe sur le contenu de la fiche. La génération complète (canonical,
  // Open Graph, JSON-LD) appartient au lot 13 — HEP-98 et HEP-99.
  return {
    title:
      product.seoTitle ??
      `${product.name} — ${formatPriceCompact(product.priceCents)} | Héphaïstos`,
    description: product.seoDescription ?? product.description,
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Une seule lecture du catalogue sert la fiche et l'upsell : les deux appels
  // partagent le même cache, il n'y a donc pas deux allers-retours en base.
  const [product, all] = await Promise.all([
    getProductBySlug(id),
    getProducts(),
  ]);

  if (!product) notFound();

  return (
    <ProductDetail
      product={product}
      related={all.filter((p) => p.slug !== product.slug)}
    />
  );
}
