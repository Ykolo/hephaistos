"use client";

import { useCart } from "@/lib/cart-queries";
import { ClientOnly } from "@/components/client-only";

const iconClasses = "relative flex cursor-pointer items-center gap-[5px] p-1";

function CartIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#141414"
      strokeWidth="1.4"
    >
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function BadgeWithCount({ onOpen }: { onOpen: () => void }) {
  const { data: cart } = useCart();
  const count = cart.itemCount;

  return (
    <button
      onClick={onOpen}
      aria-label={
        count > 0 ? `Panier, ${count} article${count > 1 ? "s" : ""}` : "Panier"
      }
      className={iconClasses}
    >
      <CartIcon />
      {count > 0 && (
        <span
          // Le compte est déjà dans le libellé du bouton : l'annoncer deux
          // fois parasiterait la lecture d'écran.
          aria-hidden="true"
          className="absolute -right-1 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold leading-none text-white tabular-nums"
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * Icône panier avec compteur (HEP-50).
 *
 * Le compteur est rendu **uniquement côté client**. Le header vit dans le
 * layout racine, prérendu et partagé : un compteur calculé au prérendu serait
 * figé dans la coquille statique et montré à tous les visiteurs.
 *
 * Le repli affiche l'icône sans compteur — le bouton reste donc présent et
 * cliquable dès le premier rendu, sans décalage de mise en page.
 */
export function CartBadge({ onOpen }: { onOpen: () => void }) {
  return (
    <ClientOnly
      fallback={
        <button onClick={onOpen} aria-label="Panier" className={iconClasses}>
          <CartIcon />
        </button>
      }
    >
      <BadgeWithCount onOpen={onOpen} />
    </ClientOnly>
  );
}
