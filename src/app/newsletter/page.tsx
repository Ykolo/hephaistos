import type { Metadata } from "next";
import { Reveal } from "@/components/reveal";
import { NewsletterHeroForm } from "@/components/newsletter-hero-form";

export const metadata: Metadata = {
  title: "Accès prioritaire — Newsletter | Héphaïstos",
  description:
    "Sois notifié en avant-première du lancement, avec un accès et une offre réservés à la liste.",
};

export default function NewsletterPage() {
  return (
    <section className="flex min-h-[70vh] items-center justify-center bg-ink px-6 py-[clamp(70px,10vw,130px)] text-center text-cream sm:px-14">
      <div className="max-w-[560px]">
        <Reveal>
          <div className="mb-7 text-[11px] uppercase tracking-[.32em] text-dust-mute">
            Accès prioritaire
          </div>
        </Reveal>
        <Reveal delay={60}>
          <h1 className="m-0 mb-6 font-serif text-[clamp(2.4rem,6vw,4rem)] font-light leading-[1.05] tracking-[-.02em] text-cream-bright">
            Rejoins ceux qui
            <br />
            se forgent.
          </h1>
        </Reveal>
        <Reveal
          delay={120}
          className="m-0 mb-10 text-[15px] leading-[1.7] text-dust-soft"
        >
          Sois notifié en avant-première du lancement, avec un accès et une
          offre réservés à la liste.
        </Reveal>
        <NewsletterHeroForm />
        <Reveal className="mt-[18px] text-[11px] tracking-[.04em] text-dust-faint">
          Pas de spam. Désinscription en un clic.
        </Reveal>
      </div>
    </section>
  );
}
