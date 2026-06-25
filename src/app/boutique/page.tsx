import type { Metadata } from "next";
import { Reveal } from "@/components/reveal";
import { NewsletterBand } from "@/components/newsletter-band";
import { ProductGrid } from "@/components/product-grid";
import { Eyebrow } from "@/components/primitives";

export const metadata: Metadata = {
  title: "Les Fondations — Boutique | Héphaïstos",
  description:
    "Trois soins essentiels pensés pour la peau masculine. Le socle d'un rituel quotidien.",
};

const filters = ["Tous", "Nettoyage", "Soin ciblé", "Hydratation"];

export default function BoutiquePage() {
  return (
    <div>
      <section className="mx-auto max-w-[1320px] px-6 pb-[clamp(30px,4vw,50px)] pt-[clamp(60px,9vw,120px)] text-center sm:px-14">
        <Reveal>
          <Eyebrow className="mb-6">La collection — Soins visage homme</Eyebrow>
        </Reveal>
        <Reveal delay={60}>
          <h1 className="m-0 mb-[26px] font-serif text-[clamp(2.6rem,6vw,4.6rem)] font-normal leading-none tracking-[-.02em]">
            Les Fondations
          </h1>
        </Reveal>
        <Reveal
          delay={120}
          className="mx-auto max-w-[50ch] font-serif text-[1.15rem] leading-[1.65] text-body"
        >
          Trois soins essentiels. Aucun superflu. Le socle d&apos;un rituel
          quotidien pensé pour la peau masculine.
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1320px] px-5 pb-[clamp(80px,12vw,150px)] sm:px-14">
        <Reveal className="mb-[clamp(40px,6vw,64px)] flex flex-wrap justify-center gap-3">
          {filters.map((f, i) => (
            <span
              key={f}
              className={
                i === 0
                  ? "border border-ink bg-ink px-[22px] py-[10px] text-[11px] font-semibold uppercase tracking-[.16em] text-white"
                  : "border border-line-strong px-[22px] py-[10px] text-[11px] font-medium uppercase tracking-[.16em] text-body"
              }
            >
              {f}
            </span>
          ))}
        </Reveal>
        <ProductGrid withSoon />
      </section>

      <NewsletterBand />
    </div>
  );
}
