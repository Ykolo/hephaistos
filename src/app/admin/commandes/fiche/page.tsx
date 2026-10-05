import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { PROVISIONAL_ACTOR_ID } from "@/server/admin-guard";
import {
  adminNextStatuses,
  getAdminOrder,
  stripePaymentUrl,
} from "@/server/services/admin-orders";
import {
  OrderCancelForm,
  OrderNoteForm,
  OrderStatusForm,
} from "@/components/admin/order-actions";
import { ORDER_STATUS_LABEL, ORDER_STATUS_STYLE } from "@/lib/order-status";
import { formatPrice } from "@/lib/format";
import { preorderNotice } from "@/lib/dates";
import { adminRoutes } from "@/lib/routes";
import { AddressBlock, sameAddress } from "@/components/admin/order-address";

type SearchParams = Promise<{ numero?: string | string[] }>;

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  dateStyle: "medium",
  timeStyle: "short",
});

const heading = "m-0 mb-3 text-[12px] font-semibold uppercase tracking-[.14em]";

/** Auteur d'un événement du journal, en clair. */
function actorLabel(actorId: string | null): string {
  switch (actorId) {
    case null:
      return "—";
    case "@stripe":
      return "Stripe";
    case "@client":
      return "Client";
    case "@systeme":
      return "Automatique";
    case PROVISIONAL_ACTOR_ID:
      return "Admin (local)";
    default:
      return actorId;
  }
}

function statusLabel(status: string | null): string {
  if (!status) return "création";
  return ORDER_STATUS_LABEL[status as keyof typeof ORDER_STATUS_LABEL] ?? status;
}

/**
 * Fiche commande (HEP-56) : tout ce qu'il faut pour traiter un appel client
 * sans ouvrir Stripe.
 */
export default function AdminOrderPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div>
      <Link
        href={adminRoutes.orders}
        className="mb-5 inline-block text-[12px] text-muted-ink underline underline-offset-4"
      >
        ← Toutes les commandes
      </Link>
      <Suspense fallback={<p className="text-[13px] text-muted-ink">Chargement de la commande…</p>}>
        <OrderDetail searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function OrderDetail({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const { numero } = await searchParams;
  const order = typeof numero === "string" ? await getAdminOrder(db, numero.trim()) : null;
  if (!order) notFound();

  const next = adminNextStatuses(order.status);
  const cancelable = ["PENDING", "PAID", "PREPARING"].includes(order.status);
  const phone =
    order.shippingAddress && typeof order.shippingAddress === "object" && !Array.isArray(order.shippingAddress)
      ? (order.shippingAddress as Record<string, unknown>).phone
      : undefined;

  return (
    <>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 mb-2 font-mono text-[1.6rem] font-normal">{order.number}</h1>
          <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-muted-ink">
            <span
              className={`px-2 py-1 text-[10px] uppercase tracking-[.12em] ${ORDER_STATUS_STYLE[order.status]}`}
            >
              {ORDER_STATUS_LABEL[order.status]}
            </span>
            <span>Passée le {dateTime.format(order.createdAt)}</span>
          </div>
          {order.isPreorder && (
            <p className="m-0 mt-3 border border-gold/40 bg-gold/10 px-3 py-2 text-[12.5px] text-body">
              {preorderNotice(order.preorderShipsAt)}
            </p>
          )}
        </div>
        <Link
          href={adminRoutes.packingSlip(order.number)}
          className="border border-ink px-6 py-[10px] text-[11.5px] font-semibold uppercase tracking-[.16em] text-ink transition-colors hover:bg-ink hover:text-white"
        >
          Bon de préparation
        </Link>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-10">
          <section>
            <h2 className={heading}>Client</h2>
            <p className="m-0 text-[13.5px] leading-[1.7]">
              <a href={`mailto:${order.email}`} className="underline underline-offset-4">
                {order.email}
              </a>
              {typeof phone === "string" && phone && (
                <>
                  {" · "}
                  <a href={`tel:${phone}`} className="underline underline-offset-4">
                    {phone}
                  </a>
                </>
              )}
              {order.userId ? " · compte client" : " · achat sans compte"}
            </p>
          </section>

          <section>
            <h2 className={heading}>Articles</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.12em] text-muted-ink">
                    <th className="py-2 pr-4 font-medium">Produit</th>
                    <th className="py-2 pr-4 font-medium">SKU</th>
                    <th className="py-2 pr-4 font-medium">Lot</th>
                    <th className="py-2 pr-4 text-right font-medium">Prix</th>
                    <th className="py-2 pr-4 text-right font-medium">Qté</th>
                    <th className="py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-b border-line-soft">
                      <td className="py-2 pr-4">{item.nameSnapshot}</td>
                      <td className="py-2 pr-4 font-mono text-[12px] text-muted-ink">{item.skuSnapshot}</td>
                      <td className="py-2 pr-4 font-mono text-[12px] text-muted-ink">{item.batchCode ?? "—"}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatPrice(item.priceCentsSnapshot)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{item.qty}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatPrice(item.priceCentsSnapshot * item.qty)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto mt-4 grid max-w-[300px] grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[13px]">
              <dt className="text-muted-ink">Sous-total</dt>
              <dd className="m-0 text-right tabular-nums">{formatPrice(order.subtotalCents)}</dd>
              {order.discountCents > 0 && (
                <>
                  <dt className="text-muted-ink">
                    Remise{order.discountCode ? ` (${order.discountCode})` : ""}
                  </dt>
                  <dd className="m-0 text-right tabular-nums">−{formatPrice(order.discountCents)}</dd>
                </>
              )}
              <dt className="text-muted-ink">Livraison</dt>
              <dd className="m-0 text-right tabular-nums">{formatPrice(order.shippingCents)}</dd>
              <dt className="border-t border-line pt-1 font-semibold">Total TTC</dt>
              <dd className="m-0 border-t border-line pt-1 text-right font-semibold tabular-nums">
                {formatPrice(order.totalCents)}
              </dd>
              <dt className="text-[12px] text-muted-ink">dont TVA ({order.vatRate / 100} %)</dt>
              <dd className="m-0 text-right text-[12px] tabular-nums text-muted-ink">
                {formatPrice(order.taxCents)}
              </dd>
            </dl>
          </section>

          <section className="grid gap-6 sm:grid-cols-2">
            <div>
              <h2 className={heading}>Livraison</h2>
              <AddressBlock value={order.shippingAddress} />
            </div>
            <div>
              <h2 className={heading}>Facturation</h2>
              {sameAddress(order.shippingAddress, order.billingAddress) ? (
                <p className="m-0 text-[13px] text-muted-ink">Identique à la livraison.</p>
              ) : (
                <AddressBlock value={order.billingAddress} />
              )}
            </div>
          </section>

          <section>
            <h2 className={heading}>Paiement</h2>
            {order.stripePaymentIntentId ? (
              <p className="m-0 text-[13px] leading-[1.7]">
                Payée le {order.paidAt ? dateTime.format(order.paidAt) : "—"} ·{" "}
                <a
                  href={stripePaymentUrl(order.stripePaymentIntentId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  Voir dans Stripe ↗
                </a>
                <br />
                <span className="font-mono text-[12px] text-muted-ink">{order.stripePaymentIntentId}</span>
              </p>
            ) : (
              <p className="m-0 text-[13px] text-muted-ink">
                {order.paidAt
                  ? `Payée le ${dateTime.format(order.paidAt)}, sans référence Stripe.`
                  : "Aucun paiement reçu."}
              </p>
            )}
            {order.invoice && (
              <p className="m-0 mt-2 text-[13px]">
                Facture <span className="font-mono">{order.invoice.number}</span> du{" "}
                {dateTime.format(order.invoice.issuedAt)}
              </p>
            )}
          </section>

          <section>
            <h2 className={heading}>Expéditions</h2>
            {order.shipments.length === 0 ? (
              <p className="m-0 text-[13px] text-muted-ink">
                Aucun colis pour l&apos;instant.
                {order.shippedAt && ` Marquée expédiée le ${dateTime.format(order.shippedAt)}.`}
              </p>
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0 text-[13px]">
                {order.shipments.map((s) => (
                  <li key={s.id}>
                    {s.carrier} · {s.method}
                    {s.trackingNumber &&
                      (s.trackingUrl ? (
                        <>
                          {" · "}
                          <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                            {s.trackingNumber} ↗
                          </a>
                        </>
                      ) : (
                        ` · ${s.trackingNumber}`
                      ))}
                    {s.shippedAt && ` · parti le ${dateTime.format(s.shippedAt)}`}
                    {s.deliveredAt && ` · livré le ${dateTime.format(s.deliveredAt)}`}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className={heading}>Journal</h2>
            {order.events.length === 0 ? (
              <p className="m-0 text-[13px] text-muted-ink">Aucun changement d&apos;état.</p>
            ) : (
              <ol className="m-0 grid list-none gap-3 border-l border-line p-0 pl-4 text-[13px]">
                {order.events.map((e) => (
                  <li key={e.id}>
                    <div className="tabular-nums text-[12px] text-muted-ink">
                      {dateTime.format(e.createdAt)} · {actorLabel(e.actorId)}
                    </div>
                    <div>
                      {statusLabel(e.from)} → <strong>{statusLabel(e.to)}</strong>
                    </div>
                    {e.note && <div className="text-body">{e.note}</div>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="grid content-start gap-8">
          <OrderStatusForm orderId={order.id} next={next} />
          <OrderNoteForm orderId={order.id} initial={order.internalNote ?? ""} />
          <OrderCancelForm
            orderId={order.id}
            cancelable={cancelable}
            paid={order.status !== "PENDING"}
            shipped={order.status === "SHIPPED" || order.status === "DELIVERED"}
          />
        </aside>
      </div>
    </>
  );
}
