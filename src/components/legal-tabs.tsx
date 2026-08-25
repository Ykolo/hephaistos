"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { legalContent, legalTabs, type LegalKey } from "@/lib/content";
import { cn } from "@/lib/utils";

const keys = legalTabs.map((t) => t.key);

export function LegalTabs() {
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
      <div className="mb-12 flex flex-wrap gap-2 border-b border-line pb-[2px]">
        {legalTabs.map((t) => (
          <button
            key={t.key}
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

      <div className="max-w-[68ch]">
        <h2 className="m-0 mb-5 font-serif text-[1.7rem] font-normal">
          {content.t}
        </h2>
        <p className="m-0 mb-5 text-[15px] leading-[1.9] text-body">
          {content.b}
        </p>
        <div className="mt-[30px] border-l-2 border-ink bg-sand px-[22px] py-[18px] text-[13px] leading-[1.7] text-body">
          Jules a déjà rédigé ces textes conformes aux normes. Ce gabarit est
          prêt à recevoir le contenu final — il suffit de coller chaque texte
          ici.
        </div>
      </div>
    </>
  );
}
