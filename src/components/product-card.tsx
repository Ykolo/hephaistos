import Link from "next/link";
import { CoverImage } from "@/components/cover-image";
import { Reveal } from "@/components/reveal";
import { routes } from "@/lib/routes";
import { formatPriceCompact } from "@/lib/format";
import type { ProductView } from "@/lib/products";

export function ProductCard({ product }: { product: ProductView }) {
  return (
    <Reveal>
      <Link href={routes.product(product.slug)} className="group block">
        <div className="relative mb-5 aspect-[3/4] overflow-hidden bg-sand-card">
          <CoverImage
            src={product.image}
            alt={product.name}
            sizes="(max-width: 860px) 100vw, 30vw"
            className="transition-transform duration-700 group-hover:scale-[1.04]"
          />
          <span className="absolute left-[14px] top-[14px] bg-ink/[.78] px-[11px] py-[6px] text-[10px] uppercase tracking-[.18em] text-white">
            {product.category}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="m-0 font-serif text-[1.3rem] font-normal leading-[1.15]">
            {product.name}
          </h3>
          <span className="whitespace-nowrap font-serif text-[1.1rem]">
            {formatPriceCompact(product.priceCents)}
          </span>
        </div>
        <p className="mt-[7px] text-[13px] tracking-[.01em] text-muted-ink">
          {product.tagline}
        </p>
      </Link>
    </Reveal>
  );
}
