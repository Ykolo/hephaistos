"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { AnnouncementBar } from "@/components/announcement-bar";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { MobileMenu } from "@/components/mobile-menu";
import { CartDrawer } from "@/components/cart-drawer";

import { CustomCursor } from "@/components/custom-cursor";
import { useUIStore } from "@/store/ui-store";

export function SiteChrome({
  children,
  searchSlot,
}: {
  children: React.ReactNode;
  /**
   * Recherche déjà rendue côté serveur, sous <Suspense>. Le chrome ne fait
   * que la placer : lui passer les données le rendrait bloquant pour toutes
   * les routes dynamiques.
   */
  searchSlot: React.ReactNode;
}) {
  const pathname = usePathname();
  const closeAllOverlays = useUIStore((s) => s.closeAllOverlays);

  // Close any open overlay + reset scroll whenever the route changes.
  useEffect(() => {
    closeAllOverlays();
    window.scrollTo(0, 0);
  }, [pathname, closeAllOverlays]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      {/* `contents` : aucune boîte, le header reste collant. Masqué à
          l'impression — le bon de préparation (HEP-56) sort sans le site. */}
      <div className="contents print:hidden">
        <AnnouncementBar />
        <Header />
      </div>
      <motion.main
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 0.84, 0.44, 1] }}
        className="flex-1"
      >
        {children}
      </motion.main>
      <div className="contents print:hidden">
        <Footer />
      </div>

      <MobileMenu />
      <CartDrawer />
      {searchSlot}
      <CustomCursor />
    </div>
  );
}
