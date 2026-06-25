"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useUIStore } from "@/store/ui-store";

export function AnnouncementBar() {
  const announce = useUIStore((s) => s.announce);
  const close = useUIStore((s) => s.closeAnnounce);

  return (
    <AnimatePresence initial={false}>
      {announce && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 0.84, 0.44, 1] }}
          className="overflow-hidden bg-ink text-cream"
        >
          <div className="relative flex items-center justify-center gap-[14px] px-4 py-[9px] pr-12 text-[10.5px] uppercase tracking-[.24em]">
            <span className="animate-ember opacity-55">●</span>
            <span className="text-center font-medium">
              Lancement imminent — rejoins la liste pour un accès prioritaire
            </span>
            <button
              onClick={close}
              aria-label="Fermer l'annonce"
              className="absolute right-[14px] top-1/2 -translate-y-1/2 cursor-pointer bg-transparent p-1 text-[15px] leading-none text-[#8a8a8a]"
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
