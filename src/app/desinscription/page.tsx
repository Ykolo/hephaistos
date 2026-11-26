import { Suspense } from "react";
import type { Metadata } from "next";
import { UnsubscribeButton } from "@/components/unsubscribe-button";

export const metadata: Metadata = {
  title: "Désinscription | Héphaïstos",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ token?: string | string[] }>;

/**
 * Désinscription de la newsletter (HEP-67), sans connexion.
 *
 * Un bouton plutôt qu'une désinscription au chargement : les antivirus et les
 * aperçus de messagerie ouvrent les liens des mails, et désinscriraient les
 * gens à leur insu. La boîte mail, elle, a sa désinscription en un clic par
 * l'en-tête `List-Unsubscribe` (`/api/newsletter/unsubscribe`).
 */
export default function UnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <section className="flex min-h-[60vh] items-center justify-center px-6 py-[clamp(70px,10vw,130px)] text-center sm:px-14">
      <div className="max-w-[520px]">
        <h1 className="m-0 mb-5 font-serif text-[clamp(2rem,5vw,3rem)] font-light leading-[1.1]">
          Se désinscrire
        </h1>
        <Suspense fallback={null}>
          <Content searchParams={searchParams} />
        </Suspense>
      </div>
    </section>
  );
}

async function Content({ searchParams }: { searchParams: SearchParams }) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token === "") {
    return (
      <p className="m-0 text-[15px] leading-[1.7] text-body">
        Ce lien est incomplet. Utilise le lien « se désinscrire » en bas de l&apos;un de nos mails.
      </p>
    );
  }
  return <UnsubscribeButton token={token} />;
}
