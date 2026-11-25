"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { legalContent, legalTabs, type LegalKey } from "@/lib/content";
import type { LegalRow } from "@/lib/company";
import { cn } from "@/lib/utils";

const keys = legalTabs.map((t) => t.key);

/**
 * Onglets de `/legal`. Les mentions légales et les CGV arrivent du serveur,
 * construites depuis les réglages entreprise (HEP-80) : ce composant client
 * ne fait que les afficher.
 */
export function LegalTabs({ mentions, cgv }: { mentions: LegalRow[]; cgv: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab") as LegalKey | null;
  const active: LegalKey = raw && keys.includes(raw) ? raw : "mentions";
  const content = legalContent[active];

  const select = (key: LegalKey) => {
    router.replace(`/legal?tab=${key}`, { scroll: false });
  };

  return (
    <>
      <div role="tablist" className="mb-12 flex flex-wrap gap-2 border-b border-line pb-[2px]">
        {legalTabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={active === t.key}
            onClick={() => select(t.key)}
            className={cn(
              "cursor-pointer border-b-2 bg-transparent px-4 py-3 text-[11px] font-semibold uppercase tracking-[.14em]",
              active === t.key
                ? "border-ink text-ink"
                : "border-transparent text-muted-ink2",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="max-w-[68ch]">
        <h2 className="m-0 mb-5 font-serif text-[1.7rem] font-normal">
          {content.t}
        </h2>

        {active === "mentions" ? (
          <dl className="m-0 grid gap-x-8 gap-y-3 text-[15px] leading-[1.7] text-body sm:grid-cols-[minmax(0,14rem)_1fr]">
            {mentions.map((r) => (
              <div key={r.label} className="contents">
                <dt className="text-[12px] uppercase tracking-[.12em] text-muted-ink sm:pt-[3px]">{r.label}</dt>
                <dd className={cn("m-0 mb-2 sm:mb-0", r.missing && "italic text-muted-ink")}>{r.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="m-0 mb-5 text-[15px] leading-[1.9] text-body">
            {active === "cgv" ? cgv : content.b}
          </p>
        )}

        {active !== "mentions" && (
          <div className="mt-[30px] border-l-2 border-ink bg-sand px-[22px] py-[18px] text-[13px] leading-[1.7] text-body">
            Jules a déjà rédigé ces textes conformes aux normes. Ce gabarit est
            prêt à recevoir le contenu final — il suffit de coller chaque texte
            ici.
          </div>
        )}
      </div>
    </>
  );
}
