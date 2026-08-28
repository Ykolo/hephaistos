"use client";

import Link from "next/link";
import Image from "next/image";
import { routes } from "@/lib/routes";
import { formatPriceCompact } from "@/lib/format";
import { formatLongDate } from "@/lib/dates";
import { useRemoveFromCart, useSetCartQty } from "@/lib/cart-queries";
import type { CartLine } from "@/server/services/cart";

/**
 * Lignes du panier — partagées par le tiroir et la page `/panier`.
 *
 * Une seule implémentation : deux copies finiraient par diverger, et c'est
 * l'écran le plus proche du paiement.
 */
export function CartLines({
  lines,
  onNavigate,
  compact = false,
}: {
  lines: CartLine[];
  /** Fermer le tiroir quand on suit un lien produit. */
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const setQty = useSetCartQty();
  const remove = useRemoveFromCart();
  const busy = setQty.isPending || remove.isPending;

  return (
    <ul className="m-0 flex list-none flex-col gap-5 p-0">
      {lines.map((line) => {
        // Un produit peut devenir indisponible ENTRE l'ajout et l'affichage.
        // On le dit ici plutôt que de laisser échouer le paiement : un échec
        // à l'étape de paiement fait perdre la vente entière, pas la ligne.
        const short = !line.isPreorder && line.qty > line.availableUnits;

        return (
          <li
            key={line.slug}
            className="flex gap-4 border-b border-line-soft pb-5 last:border-0"
          >
            <Link
              href={routes.product(line.slug)}
              onClick={onNavigate}
              className="relative aspect-square w-[76px] shrink-0 overflow-hidden bg-sand-card"
            >
              {line.image && (
                <Image
                  src={line.image}
                  alt={line.name}
                  fill
                  sizes="76px"
                  className="object-cover"
                />
              )}
            </Link>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={routes.product(line.slug)}
                  onClick={onNavigate}
                  className="font-serif text-[1.05rem] leading-tight"
                >
                  {line.name}
                </Link>
                <span className="whitespace-nowrap font-serif text-[1rem]">
                  {formatPriceCompact(line.lineTotalCents)}
                </span>
              </div>

              <p className="m-0 mt-1 text-[12px] text-muted-ink">
                {formatPriceCompact(line.unitPriceCents)} l&apos;unité
              </p>

              {line.isPreorder && (
                <p className="m-0 mt-1 text-[11.5px] leading-[1.5] text-gold">
                  Précommande
                  {line.preorderShipsAt
                    ? ` — expédition prévue le ${formatLongDate(new Date(line.preorderShipsAt))}`
                    : ""}
                </p>
              )}

              {short && (
                <p
                  role="alert"
                  className="m-0 mt-1 text-[11.5px] leading-[1.5] text-red-700"
                >
                  {line.availableUnits === 0
                    ? "Plus disponible — à retirer pour valider la commande."
                    : `Il ne reste que ${line.availableUnits} exemplaire(s).`}
                </p>
              )}

              <div className="mt-2 flex items-center gap-3">
                <div className="flex items-center border border-line-strong">
                  <button
                    type="button"
                    onClick={() =>
                      setQty.mutate({ slug: line.slug, qty: line.qty - 1 })
                    }
                    disabled={busy}
                    aria-label={`Diminuer la quantité de ${line.name}`}
                    className="h-8 w-8 cursor-pointer bg-transparent text-[15px] disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-[13px] tabular-nums">
                    {line.qty}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setQty.mutate({ slug: line.slug, qty: line.qty + 1 })
                    }
                    disabled={busy}
                    aria-label={`Augmenter la quantité de ${line.name}`}
                    className="h-8 w-8 cursor-pointer bg-transparent text-[15px] disabled:opacity-40"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => remove.mutate({ slug: line.slug })}
                  disabled={busy}
                  className={`cursor-pointer bg-transparent text-[11.5px] text-muted-ink underline underline-offset-4 disabled:opacity-40 ${compact ? "" : "ml-2"}`}
                >
                  Retirer
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
