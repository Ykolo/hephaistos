import type { Metadata } from "next";
import { Reveal } from "@/components/reveal";
import { NewsletterBand } from "@/components/newsletter-band";
import { Eyebrow } from "@/components/primitives";

export const metadata: Metadata = {
  title: "Avis & résultats | Héphaïstos",
  description:
    "Les premiers retours des testeurs du programme pilote Héphaïstos.",
};

const reviews = [
  "« Routine simple que je tiens enfin sur la durée. La peau respire. »",
  "« Le sérum a matifié ma zone T en deux semaines. Convaincu. »",
  "« Des textures premium. Un vrai moment pour soi le matin. »",
];

export default function AvisPage() {
  return (
    <div>
      <section className="mx-auto max-w-[900px] px-6 pb-[clamp(40px,5vw,56px)] pt-[clamp(70px,10vw,130px)] text-center sm:px-14">
        <Reveal>
          <Eyebrow className="mb-6">Ils se forgent</Eyebrow>
        </Reveal>
        <Reveal delay={60}>
          <h1 className="m-0 mb-[22px] font-serif text-[clamp(2.6rem,6vw,4.6rem)] font-normal leading-none tracking-[-.02em]">
            Avis &amp; résultats
          </h1>
        </Reveal>
        <Reveal delay={120} className="m-0 text-[14px] tracking-[.04em] text-gold">
          Section prête — les avis vérifiés et photos avant / après seront
          ajoutés au lancement.
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1100px] px-6 pb-[clamp(50px,7vw,90px)] sm:px-14">
        <div className="grid grid-cols-1 gap-[clamp(20px,3vw,34px)] sm:grid-cols-3">
          {reviews.map((r, i) => (
            <Reveal key={i} delay={i * 80} className="bg-sand p-[34px]">
              <div className="mb-4 tracking-[.2em]">★★★★★</div>
              <p className="m-0 mb-5 font-serif text-[1.2rem] leading-[1.55] text-ink-soft">
                {r}
              </p>
              <div className="text-[11px] uppercase tracking-[.16em] text-muted-ink">
                Testeur pilote · Vérifié
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1100px] px-6 pb-[clamp(70px,10vw,130px)] sm:px-14">
        <Reveal className="mb-8 text-center">
          <Eyebrow className="mb-4">Avant / après</Eyebrow>
          <h2 className="m-0 font-serif text-[clamp(1.8rem,4vw,2.6rem)] font-normal">
            Les résultats du rituel
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 gap-[clamp(20px,3vw,34px)] sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Reveal key={i} delay={i * 80} className="grid grid-cols-2 gap-2">
              <div className="flex aspect-[3/4] items-end justify-start bg-[#e4e0d9] p-[14px]">
                <span className="text-[10px] uppercase tracking-[.18em] text-muted-ink2">
                  Avant
                </span>
              </div>
              <div className="flex aspect-[3/4] items-end justify-end bg-[#e4e0d9] p-[14px]">
                <span className="text-[10px] uppercase tracking-[.18em] text-muted-ink2">
                  Après
                </span>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-6 text-center text-[12.5px] italic text-muted-ink2">
          Emplacements réservés — Jules fournira les photos réelles.
        </p>
      </section>

      <NewsletterBand />
    </div>
  );
}
