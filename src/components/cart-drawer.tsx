"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { routes } from "@/lib/routes";
import { useUIStore } from "@/store/ui-store";

export function CartDrawer() {
  const open = useUIStore((s) => s.cartOpen);
  const close = useUIStore((s) => s.closeCart);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1100]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="absolute inset-0 bg-ink/40"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.4, ease: [0.16, 0.84, 0.44, 1] }}
            className="absolute right-0 top-0 flex h-full w-[min(420px,100%)] flex-col bg-paper p-7"
          >
            <div className="mb-9 flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-[.2em]">
                Panier
              </span>
              <button
                onClick={close}
                aria-label="Fermer le panier"
                className="cursor-pointer bg-transparent text-xl"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="mb-[14px] font-serif text-[1.7rem]">
                Bientôt disponible
              </div>
              <p className="m-0 mb-8 max-w-[28ch] text-[14px] leading-[1.7] text-muted-ink">
                La collection ouvre au lancement. Rejoins la liste pour un accès
                prioritaire.
              </p>
              <Link
                href={routes.newsletter}
                onClick={close}
                className="bg-ink px-[34px] py-4 text-[11.5px] font-semibold uppercase tracking-[.18em] text-white"
              >
                Rejoindre la liste
              </Link>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
