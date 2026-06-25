"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { routes } from "@/lib/routes";
import { useUIStore } from "@/store/ui-store";

const items = [
  { href: routes.home, label: "Accueil" },
  { href: routes.shop, label: "Le Rituel" },
  { href: routes.histoire, label: "Histoire" },
  { href: routes.vision, label: "Vision" },
  { href: routes.avis, label: "Avis" },
  { href: routes.contact, label: "Contact" },
];

export function MobileMenu() {
  const open = useUIStore((s) => s.menuOpen);
  const close = useUIStore((s) => s.closeMenu);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[1000] flex flex-col bg-cream-bright px-6 py-6 sm:px-12"
        >
          <div className="mb-[30px] flex h-14 items-center justify-between">
            <span className="font-serif text-[20px] tracking-[.14em]">
              HÉPHAÏSTOS
            </span>
            <button
              onClick={close}
              aria-label="Fermer le menu"
              className="cursor-pointer bg-transparent text-2xl leading-none"
            >
              ✕
            </button>
          </div>

          <nav className="flex flex-col gap-1">
            {items.map((item, i) => (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + i * 0.04, duration: 0.4 }}
              >
                <Link
                  href={item.href}
                  onClick={close}
                  className="block border-b border-line-soft py-[14px] font-serif text-[2rem]"
                >
                  {item.label}
                </Link>
              </motion.div>
            ))}
          </nav>

          <Link
            href={routes.newsletter}
            onClick={close}
            className="mt-auto bg-ink p-[18px] text-center text-[11.5px] font-semibold uppercase tracking-[.18em] text-white"
          >
            Accès prioritaire au lancement
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
