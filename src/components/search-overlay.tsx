"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { routes } from "@/lib/routes";
import { useUIStore } from "@/store/ui-store";
import { formatPriceCompact } from "@/lib/format";

/**
 * Projection minimale : cette liste est sérialisée dans le HTML de **chaque**
 * page, puisque la recherche vit dans le chrome. Y envoyer les descriptions,
 * les INCI et les galeries alourdirait tout le site pour un panneau que la
 * plupart des visiteurs n'ouvriront jamais.
 */
export type SearchItem = {
  slug: string;
  name: string;
  priceCents: number;
};

export function SearchOverlay({ products }: { products: SearchItem[] }) {
  const open = useUIStore((s) => s.searchOpen);
  const close = useUIStore((s) => s.closeSearch);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[1100] bg-cream-bright/[.98] px-6 py-6 sm:px-14"
        >
          <div className="mx-auto max-w-[760px]">
            <div className="flex justify-end">
              <button
                onClick={close}
                aria-label="Fermer la recherche"
                className="cursor-pointer bg-transparent p-2 text-2xl"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              autoFocus
              placeholder="Rechercher un soin…"
              className="mb-10 w-full border-b border-ink bg-transparent py-4 font-serif text-[clamp(1.6rem,4vw,2.6rem)] outline-none"
            />
            <div className="mb-5 text-[11px] uppercase tracking-[.2em] text-muted-ink">
              Suggestions
            </div>
            <div className="flex flex-col gap-1">
              {products.map((p) => (
                <Link
                  key={p.slug}
                  href={routes.product(p.slug)}
                  onClick={close}
                  className="flex items-center justify-between border-b border-line-soft py-4"
                >
                  <span className="font-serif text-[1.3rem]">{p.name}</span>
                  <span className="text-[13px] text-muted-ink">
                    {formatPriceCompact(p.priceCents)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
