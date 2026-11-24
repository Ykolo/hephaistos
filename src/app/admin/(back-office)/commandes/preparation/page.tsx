import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { getAdminOrder } from "@/server/services/admin-orders";
import { AddressBlock } from "@/components/admin/order-address";
import { PrintButton } from "@/components/admin/order-actions";
import { preorderNotice } from "@/lib/dates";
import { adminRoutes } from "@/lib/routes";

type SearchParams = Promise<{ numero?: string | string[] }>;

const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long" });

/**
 * Bon de préparation (HEP-56) : la feuille posée à côté du carton.
 *
 * **Aucun prix** : la feuille finit souvent dans le colis, et un cadeau ne
 * doit pas arriver avec sa facture. Une colonne « lot » est laissée vide, à
 * remplir à la main — c'est la traçabilité de HEP-44 au moment où elle se
 * crée vraiment, flacon en main.
 */
export default function PackingSlipPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="text-[13px] text-muted-ink">Chargement…</p>}>
      <PackingSlip searchParams={searchParams} />
    </Suspense>
  );
}

async function PackingSlip({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const { numero } = await searchParams;
  const order = typeof numero === "string" ? await getAdminOrder(db, numero.trim()) : null;
  if (!order) notFound();

  const units = order.items.reduce((n, item) => n + item.qty, 0);

  return (
    <article className="text-ink">
      <div className="mb-8 flex items-center justify-between gap-4 print:hidden">
        <Link
          href={adminRoutes.order(order.number)}
          className="text-[12px] text-muted-ink underline underline-offset-4"
        >
          ← Retour à la commande
        </Link>
        <PrintButton />
      </div>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-6 border-b border-ink pb-5">
        <div>
          <div className="text-[11px] uppercase tracking-[.2em] text-muted-ink">
            Bon de préparation
          </div>
          <h1 className="m-0 mt-1 font-mono text-[1.8rem] font-normal">{order.number}</h1>
          <div className="mt-1 text-[13px] text-muted-ink">
            Commandée le {date.format(order.createdAt)}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-[.2em] text-muted-ink">
            Livrer à
          </div>
          <AddressBlock value={order.shippingAddress} />
        </div>
      </header>

      {order.isPreorder && (
        <p className="mb-6 border border-ink px-3 py-2 text-[13px] font-semibold">
          {preorderNotice(order.preorderShipsAt)}
        </p>
      )}

      <table className="mb-6 w-full border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-ink text-left text-[11px] uppercase tracking-[.12em]">
            <th className="w-10 py-2 pr-3 font-medium">✓</th>
            <th className="py-2 pr-4 font-medium">Produit</th>
            <th className="py-2 pr-4 font-medium">SKU</th>
            <th className="py-2 pr-4 text-right font-medium">Qté</th>
            <th className="w-40 py-2 font-medium">Lot</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-line">
              <td className="py-3 pr-3">
                <span className="inline-block h-4 w-4 border border-ink" />
              </td>
              <td className="py-3 pr-4">{item.nameSnapshot}</td>
              <td className="py-3 pr-4 font-mono text-[12px]">{item.skuSnapshot}</td>
              <td className="py-3 pr-4 text-right text-[16px] font-semibold tabular-nums">
                {item.qty}
              </td>
              <td className="py-3 font-mono text-[12px]">
                {item.batchCode ?? <span className="inline-block w-full border-b border-dashed border-line-dashed">&nbsp;</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="m-0 mb-6 text-right text-[13px]">
        <strong className="tabular-nums">{units}</strong> article{units > 1 ? "s" : ""} au total
      </p>

      {order.internalNote && (
        <section className="border border-line p-4">
          <h2 className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[.14em]">
            Consigne interne
          </h2>
          <p className="m-0 whitespace-pre-line text-[13px]">{order.internalNote}</p>
        </section>
      )}
    </article>
  );
}
