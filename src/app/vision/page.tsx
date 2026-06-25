import type { Metadata } from "next";
import { Reveal } from "@/components/reveal";
import { NewsletterBand } from "@/components/newsletter-band";
import { Eyebrow } from "@/components/primitives";

export const metadata: Metadata = {
  title: "La vision — L'avenir de la marque | Héphaïstos",
  description:
    "Où va Héphaïstos : des Fondations à la référence du soin masculin.",
};

const phases = [
  {
    label: "Phase 01",
    t: "Les Fondations",
    d: "Lancement des trois soins essentiels — nettoyant, sérum, hydratant. Le socle du rituel.",
  },
  {
    label: "Phase 02",
    t: "Le rituel complet",
    d: "Soins ciblés : contour des yeux, exfoliant, protection. Pour ceux qui veulent aller plus loin.",
  },
  {
    label: "Phase 03",
    t: "La communauté",
    d: "Événements, contenus, rendez-vous. Une marque qui accompagne au-delà du produit.",
  },
  {
    label: "Vision",
    t: "La référence du soin masculin",
    d: "Devenir la marque de référence pour l'homme qui se forge — en France, puis au-delà.",
    last: true,
  },
];

export default function VisionPage() {
  return (
    <div>
      <section className="mx-auto max-w-[900px] px-6 pb-[clamp(40px,5vw,60px)] pt-[clamp(70px,10vw,130px)] text-center sm:px-14">
        <Reveal>
          <Eyebrow className="mb-6">L&apos;avenir de la marque</Eyebrow>
        </Reveal>
        <Reveal delay={60}>
          <h1 className="m-0 mb-[26px] font-serif text-[clamp(2.6rem,6vw,4.6rem)] font-normal leading-none tracking-[-.02em]">
            La vision
          </h1>
        </Reveal>
        <Reveal
          delay={120}
          className="mx-auto max-w-[50ch] font-serif text-[1.2rem] leading-[1.65] text-body"
        >
          Héphaïstos ne s&apos;arrête pas aux Fondations. Voici où nous allons —
          un rituel qui grandit avec ceux qui le suivent.
        </Reveal>
      </section>

      <section className="mx-auto max-w-[880px] px-6 pb-[clamp(70px,10vw,130px)] sm:px-14">
        {phases.map((p) => (
          <Reveal
            key={p.label}
            className={`flex flex-col gap-3 border-t border-line py-9 sm:flex-row sm:gap-7 ${
              p.last ? "border-b" : ""
            }`}
          >
            <div className="flex-none pt-1.5 text-[12px] uppercase tracking-[.18em] text-muted-ink sm:w-[90px]">
              {p.label}
            </div>
            <div>
              <h3 className="m-0 mb-[10px] font-serif text-[1.6rem] font-normal">
                {p.t}
              </h3>
              <p className="m-0 text-[14.5px] leading-[1.75] text-body">{p.d}</p>
            </div>
          </Reveal>
        ))}
        <Reveal className="mt-10 w-full text-center">
          <span className="inline-block border border-dashed border-line-dashed px-[22px] py-[10px] text-[11px] uppercase tracking-[.14em] text-gold">
            Roadmap indicative — à affiner ensemble
          </span>
        </Reveal>
      </section>

      <NewsletterBand />
    </div>
  );
}
