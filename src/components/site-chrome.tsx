"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { AnnouncementBar } from "@/components/announcement-bar";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { MobileMenu } from "@/components/mobile-menu";
import { CartDrawer } from "@/components/cart-drawer";
import { SearchOverlay } from "@/components/search-overlay";
import { CustomCursor } from "@/components/custom-cursor";
import { useUIStore } from "@/store/ui-store";

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const closeAllOverlays = useUIStore((s) => s.closeAllOverlays);

  // Close any open overlay + reset scroll whenever the route changes.
  useEffect(() => {
    closeAllOverlays();
    window.scrollTo(0, 0);
  }, [pathname, closeAllOverlays]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      <AnnouncementBar />
      <Header />
      <motion.main
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 0.84, 0.44, 1] }}
        className="flex-1"
      >
        {children}
      </motion.main>
      <Footer />

      <MobileMenu />
      <CartDrawer />
      <SearchOverlay />
      <CustomCursor />
    </div>
  );
}
