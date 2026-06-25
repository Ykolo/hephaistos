"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { routes } from "@/lib/routes";
import { useUIStore } from "@/store/ui-store";
import { useProducts } from "@/lib/queries";

export function SearchOverlay() {
  const open = useUIStore((s) => s.searchOpen);
  const close = useUIStore((s) => s.closeSearch);
  const { data: products = [] } = useProducts();

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
                  key={p.id}
                  href={routes.product(p.id)}
                  onClick={close}
                  className="flex items-center justify-between border-b border-line-soft py-4"
                >
                  <span className="font-serif text-[1.3rem]">{p.name}</span>
                  <span className="text-[13px] text-muted-ink">{p.price}€</span>
                </Link>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
