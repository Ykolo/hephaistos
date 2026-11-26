"use client";

import { Reveal } from "@/components/reveal";
import { NewsletterForm } from "@/components/newsletter-form";
import type { NewsletterSource } from "@/server/services/newsletter";

/**
 * Bandeau d'inscription repris sur la plupart des pages (HEP-67).
 *
 * `source` dit d'où vient l'inscription : c'est ce qui permet de savoir quel
 * emplacement convertit.
 */
export function NewsletterBand({ source = "band" }: { source?: NewsletterSource }) {
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

        <NewsletterForm source={source} tone="light" />

        <Reveal className="mt-[18px] text-[11px] tracking-[.04em] text-[#a3a09a]">
          Pas de spam. Désinscription en un clic.
        </Reveal>
      </div>
    </section>
  );
}
