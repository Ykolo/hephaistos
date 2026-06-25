import { Suspense } from "react";
import type { Metadata } from "next";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/primitives";
import { LegalTabs } from "@/components/legal-tabs";

export const metadata: Metadata = {
  title: "Mentions & conditions | Héphaïstos",
  description:
    "Mentions légales, CGV, confidentialité, cookies et retours d'Héphaïstos Paris.",
};

export default function LegalPage() {
  return (
    <section className="mx-auto max-w-[1000px] px-6 pb-[clamp(70px,10vw,130px)] pt-[clamp(60px,9vw,120px)] sm:px-14">
      <Reveal>
        <Eyebrow className="mb-5">Informations légales</Eyebrow>
      </Reveal>
      <Reveal delay={60}>
        <h1 className="m-0 mb-11 font-serif text-[clamp(2.2rem,5vw,3.4rem)] font-normal leading-none tracking-[-.02em]">
          Mentions &amp; conditions
        </h1>
      </Reveal>
      <Suspense>
        <LegalTabs />
      </Suspense>
    </section>
  );
}
