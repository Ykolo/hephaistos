import type { Metadata } from "next";
import { Reveal } from "@/components/reveal";
import { ContactForm } from "@/components/contact-form";
import { Eyebrow } from "@/components/primitives";

export const metadata: Metadata = {
  title: "Contact | Héphaïstos",
  description:
    "Une question sur les produits, une commande, un partenariat ? Écris-nous.",
};

export default function ContactPage() {
  return (
    <section className="mx-auto grid max-w-[1100px] grid-cols-1 gap-[clamp(40px,6vw,80px)] px-6 py-[clamp(70px,10vw,130px)] sm:px-14 md:grid-cols-2">
      <Reveal>
        <Eyebrow className="mb-6">Écris-nous</Eyebrow>
        <h1 className="m-0 mb-[26px] font-serif text-[clamp(2.4rem,5vw,3.8rem)] font-normal leading-none tracking-[-.02em]">
          Contact
        </h1>
        <p className="m-0 mb-10 max-w-[38ch] text-[15px] leading-[1.75] text-body">
          Une question sur les produits, une commande, un partenariat ? On
          répond sous 24 à 48h ouvrées.
        </p>
        <div className="flex flex-col gap-[22px]">
          <div>
            <div className="mb-[5px] text-[11px] uppercase tracking-[.16em] text-muted-ink">
              Email
            </div>
            <div className="font-serif text-[1.2rem]">
              contact@hephaistosparis.com
            </div>
          </div>
          <div>
            <div className="mb-[5px] text-[11px] uppercase tracking-[.16em] text-muted-ink">
              Atelier
            </div>
            <div className="font-serif text-[1.2rem]">Paris, France</div>
          </div>
          <div>
            <div className="mb-[9px] text-[11px] uppercase tracking-[.16em] text-muted-ink">
              Réseaux
            </div>
            <div className="flex gap-[14px] text-[11px] font-semibold uppercase tracking-[.14em]">
              <span className="border-b border-ink pb-[3px]">Instagram</span>
              <span className="border-b border-ink pb-[3px]">TikTok</span>
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal delay={100}>
        <ContactForm />
      </Reveal>
    </section>
  );
}
