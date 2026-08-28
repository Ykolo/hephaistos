"use client";

import { useState } from "react";
import { useAddToCart } from "@/lib/cart-queries";
import { useUIStore } from "@/store/ui-store";
import type { ProductAvailability } from "@/lib/products";

/**
 * Bouton d'ajout au panier (HEP-50).
 *
 * Le libellé suit la disponibilité : « Précommander » n'est pas « Ajouter au
 * panier ». Annoncer la même chose dans les deux cas ferait découvrir le délai
 * après le paiement, alors que l'encaissement est immédiat (HEP-42).
 */
export function AddToCart({
  slug,
  availability,
  availableUnits,
  qty = 1,
  className,
  compact = false,
}: {
  slug: string;
  availability: ProductAvailability;
  availableUnits: number;
  qty?: number;
  className?: string;
  compact?: boolean;
}) {
  const add = useAddToCart();
  const openCart = useUIStore((s) => s.openCart);
  const [error, setError] = useState<string | null>(null);

  const isPreorder = availability === "PREORDER";
  const sellable =
    availability === "IN_STOCK" || isPreorder
      ? isPreorder || availableUnits > 0
      : false;

  const labelFor = () => {
    if (isPreorder) return "Précommander";
    if (availability === "COMING_SOON") return "Bientôt disponible";
    if (availability === "OUT_OF_STOCK" || availableUnits <= 0) return "Épuisé";
    if (availability === "DISCONTINUED") return "Arrêté";
    return "Ajouter au panier";
  };

  function onClick() {
    setError(null);
    add.mutate(
      { slug, qty },
      {
        // Le tiroir ne s'ouvre qu'en cas de succès : l'ouvrir avant la réponse
        // montrerait un panier qui ne contient pas encore l'article.
        onSuccess: () => openCart(),
        onError: (e) => setError(e.message),
      },
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={onClick}
        disabled={!sellable || add.isPending}
        className={
          compact
            ? "w-full cursor-pointer border border-ink bg-transparent py-[10px] text-[10.5px] font-semibold uppercase tracking-[.16em] text-ink transition-colors hover:bg-ink hover:text-white disabled:cursor-default disabled:border-line-strong disabled:text-muted-ink disabled:hover:bg-transparent disabled:hover:text-muted-ink"
            : "flex h-[54px] w-full items-center justify-center border border-ink bg-ink px-8 text-[11.5px] font-semibold uppercase tracking-[.18em] text-white transition-colors hover:bg-paper hover:text-ink disabled:cursor-default disabled:border-line-strong disabled:bg-transparent disabled:text-muted-ink"
        }
      >
        {add.isPending ? "Ajout…" : labelFor()}
      </button>

      {error && (
        <p role="alert" className="mt-2 m-0 text-[11.5px] text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
