import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductDetail } from "@/components/product-detail";
import { productMetadata } from "@/lib/metadata";
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
  if (!product) return { title: "Produit introuvable", robots: { index: false, follow: false } };

  // Champs SEO de l'admin s'ils sont remplis, sinon le nom et l'accroche
  // (HEP-98) : une fiche ne sort jamais sans titre ni description.
  return productMetadata(product);
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
