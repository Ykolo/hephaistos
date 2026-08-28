"use client";

import Link from "next/link";
import { routes } from "@/lib/routes";
import { formatPriceCompact } from "@/lib/format";
import { useCart, useEmptyCart } from "@/lib/cart-queries";
import { CartLines } from "@/components/cart-lines";
import { Reveal } from "@/components/reveal";
import { ClientOnly } from "@/components/client-only";

/**
 * Page `/panier` (HEP-50).
 *
 * Le tiroir ne suffit pas : il est étroit sur mobile, ne se partage pas par
 * lien, et le tunnel a besoin d'une URL propre.
 */
export function CartPageContent() {
  // Le panier est propre au visiteur : jamais de prérendu, sinon la coquille
  // statique servirait le panier d'un autre.
  return (
    <ClientOnly
      fallback={
        <p className="py-[clamp(40px,8vw,90px)] text-center text-[13px] text-muted-ink">
          Chargement de votre panier…
        </p>
      }
    >
      <CartContent />
    </ClientOnly>
  );
}

function CartContent() {
  const { data: cart } = useCart();
  const empty = useEmptyCart();

  if (cart.lines.length === 0) {
    return (
      <div className="py-[clamp(40px,8vw,90px)] text-center">
        <p className="m-0 mb-8 font-serif text-[1.5rem] text-body">
          Votre panier est vide.
        </p>
        <Link
          href={routes.shop}
          className="inline-block border border-ink bg-ink px-[34px] py-4 text-[11.5px] font-semibold uppercase tracking-[.18em] text-white transition-colors hover:bg-paper hover:text-ink"
        >
          Voir la collection
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-[clamp(32px,5vw,64px)] lg:grid-cols-[1fr_360px]">
      <Reveal>
        <CartLines lines={cart.lines} />

        <button
          type="button"
          onClick={() => empty.mutate()}
          disabled={empty.isPending}
          className="mt-6 cursor-pointer bg-transparent text-[12px] text-muted-ink underline underline-offset-4 disabled:opacity-40"
        >
          Vider le panier
        </button>
      </Reveal>

      <Reveal delay={80}>
        <aside className="bg-sand p-7 lg:sticky lg:top-[100px]">
          <h2 className="m-0 mb-6 text-[12px] font-semibold uppercase tracking-[.18em]">
            Récapitulatif
          </h2>

          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[13px] text-body">
              Sous-total ({cart.itemCount} article{cart.itemCount > 1 ? "s" : ""})
            </span>
            <span className="font-serif text-[1.2rem]">
              {formatPriceCompact(cart.totals.subtotalCents)}
            </span>
          </div>

          <div className="mb-5 flex items-baseline justify-between">
            <span className="text-[13px] text-body">Livraison</span>
            <span className="text-[13px] text-muted-ink">
              Calculée à l&apos;étape suivante
            </span>
          </div>

          {/*
            La TVA n'est pas ajoutée au sous-total : elle en est extraite
            (HEP-47). L'afficher rassure sur le fait que le prix annoncé est
            bien le prix payé — et c'est la ligne que le comptable cherche.
          */}
          <div className="mb-5 flex items-baseline justify-between">
            <span className="text-[13px] text-body">
              dont TVA ({String(cart.totals.vatRateBps / 100).replace(".", ",")} %)
            </span>
            <span className="text-[13px] text-muted-ink">
              {formatPriceCompact(cart.totals.taxCents)}
            </span>
          </div>

          <p className="m-0 mb-6 border-t border-line-strong pt-4 text-[11.5px] leading-[1.6] text-muted-ink">
            Prix TTC, TVA incluse. Le montant final, frais de port compris,
            s&apos;affichera avant le paiement.
          </p>

          {/*
            Le code promo relève du lot 8 (HEP-75). Le champ est visible mais
            désactivé : le retirer ferait ressurgir un décalage de mise en page
            le jour où il sera branché, et l'annoncer actif serait mentir.
          */}
          <div className="mb-6">
            <label
              htmlFor="promo"
              className="mb-1.5 block text-[11px] uppercase tracking-[.12em] text-muted-ink"
            >
              Code promo
            </label>
            <input
              id="promo"
              disabled
              placeholder="Bientôt disponible"
              className="w-full cursor-not-allowed border border-line-strong bg-transparent px-3 py-2 text-[14px] text-muted-ink"
            />
          </div>

          {cart.hasUnavailableLines && (
            <p
              role="alert"
              className="m-0 mb-4 border border-red-700/30 bg-red-50 p-3 text-[12px] leading-[1.5] text-red-700"
            >
              Un article n&apos;est plus disponible dans la quantité demandée.
              Ajustez votre panier pour continuer.
            </p>
          )}

          <button
            type="button"
            disabled
            title="Le paiement arrive avec le lot 5"
            className="flex h-[54px] w-full cursor-not-allowed items-center justify-center border border-line-strong bg-transparent text-[11.5px] font-semibold uppercase tracking-[.18em] text-muted-ink"
          >
            Passer commande
          </button>
          <p className="m-0 mt-2 text-[11px] leading-[1.5] text-muted-ink">
            Paiement sécurisé — bientôt disponible.
          </p>
        </aside>
      </Reveal>
    </div>
  );
}
