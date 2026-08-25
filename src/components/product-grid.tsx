import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import type { ProductView } from "@/lib/products";

/**
 * Grille de collection.
 *
 * Composant serveur depuis HEP-45 : les produits arrivent en props, résolus
 * pendant le rendu serveur. Plus de hook, donc plus d'état de chargement à
 * l'hydratation — la grille est déjà peinte dans le HTML.
 */
export function ProductGrid({
  products,
  withSoon = false,
}: {
  products: ProductView[];
  withSoon?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-[clamp(16px,2.5vw,34px)] sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => (
        <ProductCard key={p.slug} product={p} />
      ))}
      {withSoon && (
        <Reveal className="flex aspect-[3/4] flex-col items-center justify-center border border-dashed border-line-dashed bg-[#faf9f6] p-[30px] text-center">
          <div className="mb-3 font-serif text-[1.5rem] italic text-ink-soft">
            Bientôt
          </div>
          <p className="m-0 text-[12.5px] leading-[1.6] tracking-[.04em] text-muted-ink">
            La collection s&apos;étoffe.
            <br />
            Reste informé du prochain soin.
          </p>
        </Reveal>
      )}
    </div>
  );
}
