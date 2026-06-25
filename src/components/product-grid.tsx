"use client";

import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { useProducts } from "@/lib/queries";

/** Collection grid backed by TanStack Query. */
export function ProductGrid({ withSoon = false }: { withSoon?: boolean }) {
  const { data: products = [] } = useProducts();

  return (
    <div className="grid grid-cols-1 gap-[clamp(16px,2.5vw,34px)] sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
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
