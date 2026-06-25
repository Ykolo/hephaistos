"use client";

import { useState } from "react";
import { Reveal } from "@/components/reveal";

/** Port of HfNewsletter — the beige opt-in band reused across pages. */
export function NewsletterBand() {
  const [sent, setSent] = useState(false);

  return (
    <section className="bg-sand px-6 py-[clamp(70px,11vw,150px)] text-center sm:px-14">
      <div className="mx-auto max-w-[560px]">
        <Reveal className="mb-[26px] text-[11px] uppercase tracking-[.32em] text-muted-ink">
          Accès prioritaire au lancement
        </Reveal>
        <Reveal
          delay={80}
          className="mb-[22px] font-serif text-[clamp(2rem,5vw,3.2rem)] font-light leading-[1.06] tracking-[-.02em] text-ink"
        >
          <h2>Rejoins ceux qui se forgent.</h2>
        </Reveal>
        <Reveal
          delay={140}
          className="mb-[38px] text-[15px] leading-[1.7] text-body"
        >
          Inscris-toi pour être notifié en avant-première du lancement — et
          recevoir une offre réservée à la liste.
        </Reveal>

        {sent ? (
          <Reveal className="font-serif text-[1.4rem] text-ink">
            Tu es sur la liste. ✦
          </Reveal>
        ) : (
          <Reveal>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
              }}
              className="mx-auto flex max-w-[440px] border-b border-ink"
            >
              <input
                type="email"
                required
                placeholder="Ton adresse email"
                className="flex-1 bg-transparent px-1 py-4 text-[15px] text-ink outline-none"
              />
              <button
                type="submit"
                className="cursor-pointer bg-transparent px-2 text-[11.5px] font-semibold uppercase tracking-[.18em] text-ink"
              >
                M&apos;inscrire →
              </button>
            </form>
          </Reveal>
        )}

        <Reveal className="mt-[18px] text-[11px] tracking-[.04em] text-[#a3a09a]">
          Pas de spam. Désinscription en un clic.
        </Reveal>
      </div>
    </section>
  );
}
