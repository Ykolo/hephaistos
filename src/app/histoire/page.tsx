import type { Metadata } from "next";
import { CoverImage } from "@/components/cover-image";
import { Reveal } from "@/components/reveal";
import { NewsletterBand } from "@/components/newsletter-band";
import { heroImages } from "@/lib/content";

export const metadata: Metadata = {
  title: "L'histoire — Le feu qui forge l'acier | Héphaïstos",
  description:
    "Héphaïstos, dieu de la forge. La discipline d'un geste quotidien, pensée pour la peau masculine.",
};

const pillars = [
  {
    n: "01",
    t: "L'origine",
    d: "Un constat simple : les hommes méritent des soins pensés pour eux, sans la complexité du marché traditionnel.",
  },
  {
    n: "02",
    t: "Le nom",
    d: "Héphaïstos — la forge, la transformation, la maîtrise. Une identité qui incarne l'effort et le résultat.",
  },
  {
    n: "03",
    t: "La philosophie",
    d: "La discipline comme forme de respect de soi. Des rituels simples, tenus dans la durée.",
  },
];

export default function HistoirePage() {
  return (
    <div>
      <section className="relative flex min-h-[62vh] items-center justify-center overflow-hidden bg-ink text-center">
        <CoverImage
          src={heroImages.histoire}
          alt=""
          priority
          className="opacity-[.42]"
          sizes="100vw"
        />
        <div className="relative px-6">
          <Reveal>
            <div className="mb-[26px] text-[11px] uppercase tracking-[.34em] text-dust">
              L&apos;histoire
            </div>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="m-0 font-serif text-[clamp(2.8rem,7vw,5.5rem)] font-light leading-none tracking-[-.02em] text-cream-bright">
              Le feu qui
              <br />
              <em>forge l&apos;acier.</em>
            </h1>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-[760px] px-6 py-[clamp(70px,11vw,150px)] text-center sm:px-10">
        <Reveal className="m-0 mb-[50px] font-serif text-[clamp(1.4rem,3vw,2.1rem)] font-light leading-[1.5] text-ink-soft">
          Héphaïstos, dieu de la forge, transformait la matière brute en
          chefs-d&apos;œuvre. Le feu, la patience, le geste répété — jusqu&apos;à
          la perfection.
        </Reveal>
        <Reveal className="mx-auto mb-[50px] h-px w-10 bg-ink" />
        <Reveal className="m-0 mb-[26px] text-[15px] leading-[1.9] text-body">
          Nous croyons que l&apos;homme se forge de la même façon : par la
          discipline d&apos;un geste quotidien. Pas de promesse miracle. Pas de
          superflu. Juste la rigueur d&apos;un rituel tenu, jour après jour.
        </Reveal>
        <Reveal className="m-0 text-[15px] leading-[1.9] text-body">
          Héphaïstos, c&apos;est trois soins essentiels pensés pour la peau
          masculine — et une conviction : prendre soin de soi est un acte de
          respect envers ce que l&apos;on construit.
        </Reveal>
        <Reveal className="mt-[46px]">
          <span className="inline-block border border-dashed border-line-dashed px-[22px] py-[10px] text-[11px] uppercase tracking-[.14em] text-gold">
            Contenu à finaliser avec Jules
          </span>
        </Reveal>
      </section>

      <section className="bg-sand px-6 py-[clamp(60px,9vw,120px)] sm:px-14">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-[clamp(28px,4vw,48px)] sm:grid-cols-3">
          {pillars.map((p, i) => (
            <Reveal key={p.n} delay={i * 80}>
              <div className="mb-[10px] font-serif text-[2.6rem] text-ink">
                {p.n}
              </div>
              <h3 className="m-0 mb-3 font-serif text-[1.3rem] font-normal">
                {p.t}
              </h3>
              <p className="m-0 text-[14px] leading-[1.75] text-body">{p.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <NewsletterBand />
    </div>
  );
}
