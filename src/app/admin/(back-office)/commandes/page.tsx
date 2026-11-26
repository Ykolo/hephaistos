import { Suspense } from "react";
import { connection } from "next/server";
import Form from "next/form";
import Link from "next/link";
import { db } from "@/server/db";
import {
  countQuickFilters,
  searchOrders,
} from "@/server/services/admin-orders";
import {
  ORDER_STATUSES,
  orderSearchSchema,
  type OrderSearch,
  type QuickFilter,
} from "@/lib/validation/admin-order";
import { ORDER_STATUS_LABEL, ORDER_STATUS_STYLE } from "@/lib/order-status";
import { formatPrice } from "@/lib/format";
import { adminRoutes } from "@/lib/routes";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const QUICK_LABEL: Record<QuickFilter, string> = {
  "a-expedier": "À expédier",
  "attente-paiement": "En attente de paiement",
  precommandes: "Précommandes",
  "du-jour": "Du jour",
};

// Hauteur fixe : sans elle, le `<select>` et les champs date n'ont pas la même
// taille que le champ texte, et les libellés de la ligne se décalent.
const field =
  "h-[42px] w-full border border-line-strong bg-transparent px-3 text-[14px] outline-none focus:border-ink";
const label = "mb-1.5 block text-[11px] uppercase tracking-[.12em] text-muted-ink";

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** URL de la liste avec la recherche courante, modifiée par `patch`. */
function listHref(search: OrderSearch, patch: Partial<OrderSearch>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...search, ...patch })) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${adminRoutes.orders}?${query}` : adminRoutes.orders;
}

/**
 * Liste des commandes (HEP-56).
 *
 * Même découpe que les autres écrans d'admin : coquille statique, données en
 * flux. `searchParams` est transmis sans être attendu, pour la même raison
 * que `params` sur la fiche produit — l'attendre ici rendrait toute la page
 * bloquante.
 */
export default function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div>
      <h1 className="m-0 mb-6 font-serif text-[1.8rem] font-normal">Commandes</h1>
      <Suspense
        fallback={<p className="text-[13px] text-muted-ink">Chargement des commandes…</p>}
      >
        <Orders searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Orders({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const search = orderSearchSchema.parse(await searchParams);
  const [result, counts] = await Promise.all([
    searchOrders(db, search),
    countQuickFilters(db),
  ]);

  return (
    <>
      <nav aria-label="Filtres rapides" className="mb-6 flex flex-wrap gap-2">
        <QuickLink href={listHref({}, {})} active={!search.quick}>
          Toutes
        </QuickLink>
        {(Object.keys(QUICK_LABEL) as QuickFilter[]).map((quick) => (
          <QuickLink
            key={quick}
            // Un raccourci repart d'une recherche vierge : combiné à un vieux
            // filtre d'état, « à expédier » pourrait afficher une pile vide.
            href={listHref({}, { quick })}
            active={search.quick === quick}
          >
            {QUICK_LABEL[quick]}
            <span className="ml-2 tabular-nums opacity-70">{counts[quick]}</span>
          </QuickLink>
        ))}
      </nav>

      {/* `next/form` : une recherche est une URL, partageable et rechargeable. */}
      <Form action={adminRoutes.orders} className="mb-8 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
        {search.quick && <input type="hidden" name="quick" value={search.quick} />}
        <div>
          <label className={label} htmlFor="q">
            Numéro, nom ou email
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={search.q ?? ""}
            placeholder="HF-2026-0042, Forgeron, jules@…"
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor="status">
            État
          </label>
          <select id="status" name="status" defaultValue={search.status ?? ""} className={field}>
            <option value="">Tous</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="from">
            Du
          </label>
          <input id="from" name="from" type="date" defaultValue={search.from ?? ""} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="to">
            Au
          </label>
          <input id="to" name="to" type="date" defaultValue={search.to ?? ""} className={field} />
        </div>
        <button
          type="submit"
          className="cursor-pointer border border-ink bg-ink px-6 py-[10px] text-[11.5px] font-semibold uppercase tracking-[.16em] text-white transition-colors hover:bg-paper hover:text-ink"
        >
          Rechercher
        </button>
      </Form>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-muted-ink">
        <span>
          <strong className="text-ink">{result.total}</strong> commande
          {result.total > 1 ? "s" : ""}
        </span>
        <Link
          href={listHref(search, { sort: result.sort === "desc" ? "asc" : "desc", page: undefined })}
          className="underline underline-offset-4"
        >
          {result.sort === "desc" ? "Plus récentes d'abord" : "Plus anciennes d'abord"} ⇅
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.12em] text-muted-ink">
              <th className="py-3 pr-4 font-medium">Numéro</th>
              <th className="py-3 pr-4 font-medium">Client</th>
              <th className="py-3 pr-4 text-right font-medium">Total</th>
              <th className="py-3 pr-4 font-medium">État</th>
              <th className="py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((o) => (
              <tr key={o.id} className="border-b border-line-soft">
                <td className="py-3 pr-4 font-mono text-[12px]">
                  <Link
                    href={adminRoutes.order(o.number)}
                    className="underline underline-offset-4"
                  >
                    {o.number}
                  </Link>
                  {o.isPreorder && (
                    <span className="ml-2 font-sans text-[10px] uppercase tracking-[.12em] text-gold">
                      Précommande
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <div>{o.customerName ?? "—"}</div>
                  <div className="text-[12px] text-muted-ink">{o.email}</div>
                </td>
                <td className="py-3 pr-4 text-right tabular-nums">{formatPrice(o.totalCents)}</td>
                <td className="py-3 pr-4">
                  <span
                    className={`whitespace-nowrap px-2 py-1 text-[10px] uppercase tracking-[.12em] ${ORDER_STATUS_STYLE[o.status]}`}
                  >
                    {ORDER_STATUS_LABEL[o.status]}
                  </span>
                </td>
                <td className="py-3 tabular-nums text-muted-ink">{dateTime.format(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.rows.length === 0 && (
        <p className="mt-6 text-[13px] text-muted-ink">Aucune commande ne correspond.</p>
      )}

      {result.pageCount > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center gap-4 text-[13px]">
          {result.page > 1 && (
            <Link href={listHref(search, { page: result.page - 1 })} className="underline underline-offset-4">
              ← Précédente
            </Link>
          )}
          <span className="tabular-nums text-muted-ink">
            Page {result.page} / {result.pageCount}
          </span>
          {result.page < result.pageCount && (
            <Link href={listHref(search, { page: result.page + 1 })} className="underline underline-offset-4">
              Suivante →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

function QuickLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`border px-4 py-2 text-[11.5px] uppercase tracking-[.12em] transition-colors ${
        active ? "border-ink bg-ink text-white" : "border-line text-body hover:border-ink"
      }`}
    >
      {children}
    </Link>
  );
}
