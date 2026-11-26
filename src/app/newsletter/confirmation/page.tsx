import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Inscription à la newsletter",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ etat?: string | string[] }>;

const MESSAGES: Record<string, { title: string; body: string }> = {
  confirmed: {
    title: "Tu es sur la liste. ✦",
    body: "Ton inscription est confirmée. Tu seras prévenu en avant-première du lancement.",
  },
  already: {
    title: "C'est déjà fait.",
    body: "Ton inscription était déjà confirmée. Rien d'autre à faire.",
  },
  expired: {
    title: "Ce lien a expiré.",
    body: "Il n'était valable que 7 jours. Inscris-toi de nouveau : un nouveau lien partira aussitôt.",
  },
  invalid: {
    title: "Ce lien n'est pas valide.",
    body: "Il a peut-être été coupé par ta messagerie. Inscris-toi de nouveau pour en recevoir un autre.",
  },
};

/** Résultat du lien de confirmation (HEP-67). */
export default function NewsletterConfirmationPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <section className="flex min-h-[60vh] items-center justify-center bg-ink px-6 py-[clamp(70px,10vw,130px)] text-center text-cream sm:px-14">
      <div className="max-w-[520px]">
        <Suspense fallback={null}>
          <Result searchParams={searchParams} />
        </Suspense>
      </div>
    </section>
  );
}

async function Result({ searchParams }: { searchParams: SearchParams }) {
  const { etat } = await searchParams;
  const key = typeof etat === "string" && etat in MESSAGES ? etat : "invalid";
  const message = MESSAGES[key];
  const retry = key === "expired" || key === "invalid";
  return (
    <>
      <h1 className="m-0 mb-5 font-serif text-[clamp(2rem,5vw,3rem)] font-light leading-[1.1] text-cream-bright">
        {message.title}
      </h1>
      <p className="m-0 mb-9 text-[15px] leading-[1.7] text-dust-soft">{message.body}</p>
      <Link
        href={retry ? routes.newsletter : routes.shop}
        className="inline-block border border-cream px-[34px] py-4 text-[11.5px] font-semibold uppercase tracking-[.18em] text-cream transition-colors hover:bg-cream hover:text-ink"
      >
        {retry ? "Me réinscrire" : "Voir la collection"}
      </Link>
    </>
  );
}
