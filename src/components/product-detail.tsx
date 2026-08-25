"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { CoverImage } from "@/components/cover-image";
import { Reveal } from "@/components/reveal";
import { NewsletterBand } from "@/components/newsletter-band";
import { formatPriceCompact } from "@/lib/format";
import { routes } from "@/lib/routes";
import type { ProductView } from "@/lib/products";

const reassurance = [
  { t: "Fabriqué en France", d: "Formulation locale" },
  { t: "Formule clean", d: "Sans superflu" },
  { t: "Envoi soigné", d: "Expédié sous 48h" },
];

/** Repli tant que la fiche produit n'a pas ses précautions renseignées en base. */
const DEFAULT_PRECAUTIONS =
  "Usage externe uniquement. Éviter le contour des yeux. En cas de contact, rincer abondamment. Tenir hors de portée des enfants. Conserver à l'abri de la chaleur. Cesser l'utilisation en cas de réaction.";

type AccKey = "benef" | "usage" | "compo" | "prec" | "";

function Accordion({
  open,
  onToggle,
  title,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-line">
      <button
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center justify-between bg-transparent py-[22px] text-left"
      >
        <span className="text-[12px] font-semibold uppercase tracking-[.16em]">
          {title}
        </span>
        <span className="text-[18px] text-muted-ink">{open ? "−" : "+"}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 0.84, 0.44, 1] }}
            className="overflow-hidden"
          >
            <div className="pb-6">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Fiche produit. Reste un composant client pour les accordéons et le sélecteur
 * de quantité, mais ne va plus chercher ses données : elles arrivent en props
 * depuis le rendu serveur (HEP-45).
 */
export function ProductDetail({
  product: current,
  related,
}: {
  product: ProductView;
  related: ProductView[];
}) {
  const [qty, setQty] = useState(1);
  const [acc, setAcc] = useState<AccKey>("benef");

  const toggle = (k: AccKey) => setAcc((cur) => (cur === k ? "" : k));

  return (
    <div>
      {/* breadcrumb */}
      <div className="mx-auto max-w-[1320px] px-5 pt-6 text-[11px] uppercase tracking-[.12em] text-muted-ink2 sm:px-14">
        <Link href={routes.home}>Accueil</Link>
        <span className="mx-2">/</span>
        <Link href={routes.shop}>Les Fondations</Link>
        <span className="mx-2">/</span>
        <span className="text-ink">{current.name}</span>
      </div>

      <section className="mx-auto grid max-w-[1320px] grid-cols-1 items-start gap-[clamp(34px,5vw,72px)] px-5 pb-[clamp(60px,9vw,110px)] pt-[clamp(28px,4vw,56px)] sm:px-14 md:grid-cols-2">
        {/* gallery */}
        <div className="md:sticky md:top-[90px]">
          <div className="relative mb-[14px] aspect-[4/5] overflow-hidden bg-sand-card">
            <CoverImage
              src={current.image}
              alt={current.name}
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
          <div className="grid grid-cols-2 gap-[14px]">
            <div className="relative aspect-square overflow-hidden bg-sand-card">
              <CoverImage src={current.gallery[1] ?? current.imageHover} sizes="25vw" />
            </div>
            <div className="relative aspect-square overflow-hidden bg-sand-card">
              <CoverImage src={current.image} sizes="25vw" />
            </div>
          </div>
        </div>

        {/* info */}
        <div>
          <div className="mb-[18px] text-[11px] uppercase tracking-[.3em] text-muted-ink">
            {current.category}
          </div>
          <h1 className="m-0 mb-[14px] font-serif text-[clamp(2.1rem,4.5vw,3.3rem)] font-normal leading-[1.04] tracking-[-.02em]">
            {current.name}
          </h1>
          <p className="m-0 mb-[22px] font-serif text-[1.2rem] italic text-body">
            {current.tagline}
          </p>
          <div className="mb-[30px] flex items-center gap-[18px]">
            <span className="font-serif text-[1.7rem]">
              {formatPriceCompact(current.priceCents)}
            </span>
            <span className="text-[11px] uppercase tracking-[.16em] text-ink">
              ★★★★★ <span className="text-muted-ink2">· Programme pilote</span>
            </span>
          </div>
          <p className="m-0 mb-8 max-w-[46ch] text-[15px] leading-[1.75] text-body">
            {current.description}
          </p>

          {/* quantity + CTA */}
          <div className="mb-[18px] flex flex-wrap items-stretch gap-[14px]">
            <div className="flex items-center border border-line-strong">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label="Diminuer la quantité"
                className="h-[54px] w-[46px] cursor-pointer bg-transparent text-[18px] text-ink"
              >
                −
              </button>
              <span className="w-10 text-center text-[15px]">{qty}</span>
              <button
                onClick={() => setQty((q) => q + 1)}
                aria-label="Augmenter la quantité"
                className="h-[54px] w-[46px] cursor-pointer bg-transparent text-[18px] text-ink"
              >
                +
              </button>
            </div>
            <Link
              href={routes.newsletter}
              className="flex h-[54px] flex-1 basis-[220px] items-center justify-center border border-ink bg-ink px-8 text-[11.5px] font-semibold uppercase tracking-[.18em] text-white transition-colors hover:bg-paper hover:text-ink"
            >
              Me prévenir au lancement
            </Link>
          </div>
          <p className="m-0 mb-[30px] text-[12px] tracking-[.06em] text-gold">
            ● Épuisé — disponible au lancement. Rejoins la liste pour un accès
            prioritaire.
          </p>

          {/* reassurance */}
          <div className="mb-2 flex flex-wrap gap-[22px] border-y border-line py-[22px]">
            {reassurance.map((r) => (
              <div key={r.t} className="flex-1 basis-[120px]">
                <div className="mb-[5px] text-[11px] font-semibold uppercase tracking-[.14em]">
                  {r.t}
                </div>
                <div className="text-[12px] text-muted-ink">{r.d}</div>
              </div>
            ))}
          </div>

          {/* accordions */}
          <div className="mt-[18px]">
            <Accordion
              open={acc === "benef"}
              onToggle={() => toggle("benef")}
              title="Bénéfices"
            >
              <ul className="m-0 list-disc pl-[18px] text-[14px] leading-[1.9] text-body">
                {current.benefits.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Accordion>
            <Accordion
              open={acc === "usage"}
              onToggle={() => toggle("usage")}
              title="Conseils d'utilisation"
            >
              <div className="text-[14px] leading-[1.8] text-body">
                {current.usage}
              </div>
            </Accordion>
            <Accordion
              open={acc === "compo"}
              onToggle={() => toggle("compo")}
              title="Composition (INCI)"
            >
              <div className="text-[12.5px] italic leading-[1.8] text-muted-ink">
                {current.inci}
              </div>
            </Accordion>
            <Accordion
              open={acc === "prec"}
              onToggle={() => toggle("prec")}
              title="Précautions"
            >
              <div className="text-[13px] leading-[1.8] text-body">
                {current.precautions ?? DEFAULT_PRECAUTIONS}
              </div>
            </Accordion>
          </div>
        </div>
      </section>

      {/* UPSELL */}
      <section className="bg-sand px-5 py-[clamp(60px,9vw,120px)] sm:px-14">
        <div className="mx-auto max-w-[1320px]">
          <Reveal className="mb-[clamp(36px,5vw,56px)] text-center">
            <div className="mb-4 text-[11px] uppercase tracking-[.3em] text-muted-ink">
              Complète ton rituel
            </div>
            <h2 className="m-0 font-serif text-[clamp(1.8rem,4vw,2.8rem)] font-normal tracking-[-.01em]">
              Les trois gestes
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-[clamp(16px,2.5vw,30px)] sm:grid-cols-2">
            {related.map((p, i) => (
              <Reveal key={p.slug} delay={i * 80}>
                <Link
                  href={routes.product(p.slug)}
                  className="block bg-paper p-[18px]"
                >
                  <div className="relative mb-4 aspect-square overflow-hidden bg-sand-card">
                    <CoverImage
                      src={p.image}
                      alt={p.name}
                      sizes="(max-width: 640px) 100vw, 40vw"
                    />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <h3 className="m-0 font-serif text-[1.15rem] font-normal">
                      {p.name}
                    </h3>
                    <span className="font-serif">
                      {formatPriceCompact(p.priceCents)}
                    </span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <NewsletterBand />
    </div>
  );
}
