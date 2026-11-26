import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/server/db";
import { listShippingRates } from "@/server/services/shipping";
import {
  DeleteShippingRate,
  ShippingRateForm,
  type ShippingRateFormValues,
} from "@/components/admin/shipping-rate-form";
import { carrierLabel, PACKAGING_GRAMS, SHIPPING_METHOD_LABELS, SHIPPING_METHODS } from "@/lib/shipping";
import { formatPriceCompact } from "@/lib/format";
import { adminRoutes } from "@/lib/routes";

type SearchParams = Promise<{ modifier?: string | string[] }>;

/**
 * Grille de frais de port (HEP-70) : un tarif se change ici, sans développeur.
 */
export default function ShippingPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div>
      <h1 className="m-0 mb-2 font-serif text-[1.8rem] font-normal">Livraison</h1>
      <p className="m-0 mb-8 max-w-[70ch] text-[12.5px] leading-[1.6] text-muted-ink">
        Le colis pèse la somme des produits, plus {PACKAGING_GRAMS} g d&apos;emballage. Il prend la
        tranche la plus légère qui le contient ; au-delà de la dernière tranche d&apos;un mode, ce mode
        n&apos;est pas proposé. Le seuil de livraison offerte se juge <strong>après remise</strong>. Une
        commande passée garde le port qu&apos;elle a payé.
      </p>
      <Suspense fallback={<p className="text-[13px] text-muted-ink">Chargement…</p>}>
        <ShippingContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function euros(cents: number): string {
  return String(cents / 100).replace(".", ",");
}

async function ShippingContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const { modifier } = await searchParams;
  const editId = typeof modifier === "string" ? modifier : null;

  const rates = await listShippingRates(db);
  const editing = editId ? rates.find((r) => r.id === editId) : undefined;
  const initial: ShippingRateFormValues | undefined = editing && {
    id: editing.id,
    carrier: editing.carrier,
    method: editing.method,
    maxWeight: String(editing.maxWeightGrams),
    price: euros(editing.priceCents),
    freeAbove: editing.freeAboveCents ? euros(editing.freeAboveCents) : "",
    active: editing.active,
  };

  return (
    <>
      <h2 className="m-0 mb-4 font-serif text-[1.3rem] font-normal">
        {editing
          ? `Modifier ${SHIPPING_METHOD_LABELS[editing.method].toLowerCase()} ≤ ${editing.maxWeightGrams} g`
          : "Nouvelle tranche"}
      </h2>
      {editId && !editing && (
        <p role="alert" className="m-0 mb-4 text-[13px] text-red-700">
          Cette tranche est introuvable.
        </p>
      )}
      <ShippingRateForm key={editing?.id ?? "new"} initial={initial} />
      {editing && (
        <Link href="/admin/livraison" className="mb-10 inline-block text-[12px] text-muted-ink underline underline-offset-4">
          Annuler la modification
        </Link>
      )}

      {SHIPPING_METHODS.map((method) => {
        const tiers = rates.filter((r) => r.method === method);
        return (
          <section key={method} className="mt-8">
            <h2 className="m-0 mb-4 font-serif text-[1.3rem] font-normal">{SHIPPING_METHOD_LABELS[method]}</h2>
            {tiers.length === 0 ? (
              <p className="text-[13px] text-muted-ink">Aucune tranche : ce mode n&apos;est pas proposé.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.12em] text-muted-ink">
                      <th className="py-2 pr-4 font-medium">Poids</th>
                      <th className="py-2 pr-4 font-medium">Transporteur</th>
                      <th className="py-2 pr-4 font-medium">Prix</th>
                      <th className="py-2 pr-4 font-medium">Offerte dès</th>
                      <th className="py-2 pr-4 font-medium">État</th>
                      <th className="py-2 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiers.map((r, i) => {
                      const from = tiers.slice(0, i).filter((t) => t.active).at(-1);
                      const description = `${SHIPPING_METHOD_LABELS[method].toLowerCase()} ≤ ${r.maxWeightGrams} g`;
                      return (
                        <tr key={r.id} className="border-b border-line-soft align-top">
                          <td className="py-2 pr-4 whitespace-nowrap">
                            <Link
                              href={`/admin/livraison?modifier=${encodeURIComponent(r.id)}`}
                              className="underline underline-offset-4"
                            >
                              {from ? `${from.maxWeightGrams + 1} – ` : "Jusqu'à "}
                              {r.maxWeightGrams} g
                            </Link>
                          </td>
                          <td className="py-2 pr-4">{carrierLabel(r.carrier)}</td>
                          <td className="py-2 pr-4 tabular-nums">{formatPriceCompact(r.priceCents)}</td>
                          <td className="py-2 pr-4 tabular-nums">
                            {r.freeAboveCents ? formatPriceCompact(r.freeAboveCents) : "—"}
                          </td>
                          <td className={`py-2 pr-4 ${r.active ? "text-green-700" : "text-muted-ink"}`}>
                            {r.active ? "Proposée" : "Masquée"}
                          </td>
                          <td className="py-2">
                            <DeleteShippingRate id={r.id} description={description} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      <p className="mt-6 text-[11.5px] text-muted-ink">
        Chaque modification est inscrite au{" "}
        <Link href={`${adminRoutes.auditLog}?entite=ShippingRate`} className="underline underline-offset-4">
          journal
        </Link>
        .
      </p>
    </>
  );
}
