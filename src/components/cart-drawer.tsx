"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { routes } from "@/lib/routes";
import { useUIStore } from "@/store/ui-store";
import { useCart } from "@/lib/cart-queries";
import { formatPriceCompact } from "@/lib/format";
import { CartLines } from "@/components/cart-lines";

/**
 * Tiroir panier (HEP-50).
 *
 * `useCart` vit dans `DrawerContent`, monté seulement à l'ouverture. Appelé au
 * niveau du tiroir, il s'exécuterait au prérendu du layout racine — or le
 * panier est propre à chaque visiteur et n'a rien à faire dans une coquille
 * statique partagée.
 */
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
            className="absolute right-0 top-0 flex h-full w-[min(420px,100%)] flex-col bg-paper"
            role="dialog"
            aria-label="Panier"
          >
            <DrawerContent close={close} />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

function DrawerContent({ close }: { close: () => void }) {
  const { data: cart } = useCart();
  const empty = cart.lines.length === 0;

  return (
    <>
            <div className="flex items-center justify-between border-b border-line px-7 py-6">
              <span className="text-[12px] font-semibold uppercase tracking-[.2em]">
                Panier{cart.itemCount > 0 && ` (${cart.itemCount})`}
              </span>
              <button
                onClick={close}
                aria-label="Fermer le panier"
                className="cursor-pointer bg-transparent text-xl"
              >
                ✕
              </button>
            </div>

            {empty ? (
              <div className="flex flex-1 flex-col items-center justify-center px-7 text-center">
                <div className="mb-[14px] font-serif text-[1.7rem]">
                  Votre panier est vide
                </div>
                <p className="m-0 mb-8 max-w-[28ch] text-[14px] leading-[1.7] text-muted-ink">
                  Trois soins essentiels, pensés pour se compléter.
                </p>
                <Link
                  href={routes.shop}
                  onClick={close}
                  className="bg-ink px-[34px] py-4 text-[11.5px] font-semibold uppercase tracking-[.18em] text-white"
                >
                  Voir la collection
                </Link>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-7 py-6">
                  <CartLines lines={cart.lines} onNavigate={close} compact />
                </div>

                <div className="border-t border-line px-7 py-6">
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-[12px] uppercase tracking-[.14em] text-muted-ink">
                      Sous-total
                    </span>
                    <span className="font-serif text-[1.3rem]">
                      {formatPriceCompact(cart.totals.subtotalCents)}
                    </span>
                  </div>
                  {/*
                    Mention obligatoire, et honnêteté commerciale : le total
                    affiché n'est pas encore le montant à payer — la livraison
                    manque encore (`totals.shippingKnown` est faux ici).
                  */}
                  <p className="m-0 mb-5 text-[11.5px] leading-[1.5] text-muted-ink">
                    TVA incluse. Frais de livraison calculés à l&apos;étape
                    suivante.
                  </p>

                  {cart.hasUnavailableLines && (
                    <p
                      role="alert"
                      className="m-0 mb-4 border border-red-700/30 bg-red-50 p-3 text-[12px] leading-[1.5] text-red-700"
                    >
                      Un article de votre panier n&apos;est plus disponible dans
                      la quantité demandée. Ajustez-le pour continuer.
                    </p>
                  )}

                  <Link
                    href={routes.cart}
                    onClick={close}
                    className="flex h-[52px] items-center justify-center border border-ink bg-ink text-[11.5px] font-semibold uppercase tracking-[.18em] text-white transition-colors hover:bg-paper hover:text-ink"
                  >
                    Voir le panier
                  </Link>
                </div>
              </>
            )}
    </>
  );
}
