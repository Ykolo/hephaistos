import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/server/db";
import { listDiscounts } from "@/server/services/discounts";
import { DiscountForm, DiscountToggle, type DiscountFormValues } from "@/components/admin/discount-form";
import { discountLabel } from "@/lib/discounts";
import { formatLongDate, toParisIsoDate } from "@/lib/dates";
import { formatPriceCompact } from "@/lib/format";
import { adminRoutes } from "@/lib/routes";

type SearchParams = Promise<{ modifier?: string | string[] }>;

/**
 * Codes promo (HEP-75) : création, modification, suspension, et suivi des
 * utilisations.
 */
export default function DiscountsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div>
      <h1 className="m-0 mb-2 font-serif text-[1.8rem] font-normal">Codes promo</h1>
      <p className="m-0 mb-8 max-w-[70ch] text-[12.5px] leading-[1.6] text-muted-ink">
        Un seul code par commande. Une utilisation n&apos;est comptée qu&apos;au{" "}
        <strong>paiement confirmé</strong> : un panier abandonné ne consomme rien. Un code utilisé ne
        se supprime pas — il se suspend.
      </p>
      <Suspense fallback={<p className="text-[13px] text-muted-ink">Chargement…</p>}>
        <DiscountsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** Date de fin affichée : le dernier jour **inclus**, la fin stockée étant exclusive. */
function lastDay(endsAt: Date): Date {
  return new Date(endsAt.getTime() - 1);
}

async function DiscountsContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const { modifier } = await searchParams;
  const editId = typeof modifier === "string" ? modifier : null;

  const [discounts, products] = await Promise.all([
    listDiscounts(db),
    db.product.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { position: "asc" },
      select: { slug: true, name: true },
    }),
  ]);

  const editing = editId ? discounts.find((d) => d.id === editId) : undefined;
  const initial: DiscountFormValues | undefined = editing && {
    id: editing.id,
    code: editing.code,
    type: editing.type,
    value:
      editing.type === "FIXED"
        ? String(editing.value / 100).replace(".", ",")
        : editing.type === "PERCENT"
          ? String(editing.value / 100).replace(".", ",")
          : "",
    minOrder: editing.minOrderCents ? String(editing.minOrderCents / 100).replace(".", ",") : "",
    productSlug: editing.product?.slug ?? "",
    startsOn: editing.startsAt ? toParisIsoDate(editing.startsAt) : "",
    endsOn: editing.endsAt ? toParisIsoDate(lastDay(editing.endsAt)) : "",
    maxUses: editing.maxUses ? String(editing.maxUses) : "",
    maxUsesPerCustomer: String(editing.maxUsesPerCustomer),
    active: editing.active,
  };

  const now = new Date();

  return (
    <>
      <h2 className="m-0 mb-4 font-serif text-[1.3rem] font-normal">
        {editing ? `Modifier ${editing.code}` : "Nouveau code"}
      </h2>
      {editId && !editing && (
        <p role="alert" className="m-0 mb-4 text-[13px] text-red-700">
          Ce code est introuvable.
        </p>
      )}
      {/* `key` : changer de code à modifier repart d'un formulaire neuf. */}
      <DiscountForm key={editing?.id ?? "new"} products={products} initial={initial} />
      {editing && (
        <Link href="/admin/codes-promo" className="mb-10 inline-block text-[12px] text-muted-ink underline underline-offset-4">
          Annuler la modification
        </Link>
      )}

      <h2 className="m-0 mb-4 mt-4 font-serif text-[1.3rem] font-normal">Codes enregistrés</h2>
      {discounts.length === 0 ? (
        <p className="text-[13px] text-muted-ink">Aucun code pour le moment.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.12em] text-muted-ink">
                <th className="py-2 pr-4 font-medium">Code</th>
                <th className="py-2 pr-4 font-medium">Remise</th>
                <th className="py-2 pr-4 font-medium">Conditions</th>
                <th className="py-2 pr-4 font-medium">Validité</th>
                <th className="py-2 pr-4 font-medium">Utilisations</th>
                <th className="py-2 font-medium">État</th>
              </tr>
            </thead>
            <tbody>
              {discounts.map((d) => {
                const expired = d.endsAt !== null && d.endsAt <= now;
                const exhausted = d.maxUses !== null && d.usedCount >= d.maxUses;
                return (
                  <tr key={d.id} className="border-b border-line-soft align-top">
                    <td className="py-2 pr-4">
                      <Link
                        href={`/admin/codes-promo?modifier=${encodeURIComponent(d.id)}`}
                        className="font-mono text-[12px] underline underline-offset-4"
                      >
                        {d.code}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{discountLabel(d)}</td>
                    <td className="py-2 pr-4 text-[12px] text-muted-ink">
                      {d.product ? <div>{d.product.name} uniquement</div> : <div>Tout le panier</div>}
                      {d.minOrderCents ? <div>Dès {formatPriceCompact(d.minOrderCents)}</div> : null}
                      <div>
                        {d.maxUsesPerCustomer === 1
                          ? "Une fois par client"
                          : `${d.maxUsesPerCustomer} fois par client`}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-[12px] text-muted-ink">
                      {d.startsAt ? <div>Dès le {formatLongDate(d.startsAt)}</div> : null}
                      {d.endsAt ? (
                        <div className={expired ? "text-red-700" : undefined}>
                          Jusqu&apos;au {formatLongDate(lastDay(d.endsAt))}
                          {expired ? " — expiré" : ""}
                        </div>
                      ) : (
                        <div>Sans limite</div>
                      )}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      <span className={exhausted ? "text-red-700" : undefined}>
                        {d.usedCount}
                        {d.maxUses !== null ? ` / ${d.maxUses}` : ""}
                      </span>
                    </td>
                    <td className="py-2">
                      <DiscountToggle id={d.id} active={d.active} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-6 text-[11.5px] text-muted-ink">
        Chaque création, modification ou suspension est inscrite au{" "}
        <Link href={`${adminRoutes.auditLog}?entite=Discount`} className="underline underline-offset-4">
          journal
        </Link>
        .
      </p>
    </>
  );
}
