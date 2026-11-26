import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { db } from "@/server/db";
import { listAllProducts } from "@/server/services/catalog";
import { formatPrice, formatPricePer100ml } from "@/lib/format";

const STATUS_LABEL = {
  DRAFT: "Brouillon",
  PUBLISHED: "Publié",
  ARCHIVED: "Archivé",
} as const;

const STATUS_STYLE = {
  DRAFT: "bg-sand text-body",
  PUBLISHED: "bg-ink text-white",
  ARCHIVED: "bg-transparent text-muted-ink2 border border-line",
} as const;

/**
 * La coquille est statique, le tableau arrive en flux.
 *
 * Sans ce `Suspense`, la lecture non mise en cache remonterait jusqu'au layout
 * racine et bloquerait le rendu de **toutes** les pages — `cacheComponents`
 * refuse d'ailleurs de construire dans ce cas.
 */
export default function AdminProductsPage() {
  return (
    <div>
      <h1 className="m-0 mb-6 font-serif text-[1.8rem] font-normal">Produits</h1>
      <Suspense
        fallback={
          <p className="text-[13px] text-muted-ink">Chargement du catalogue…</p>
        }
      >
        <ProductsTable />
      </Suspense>
    </div>
  );
}

async function ProductsTable() {
  // L'admin doit voir l'état réel de la base, pas une version mise en cache :
  // `connection()` reporte le rendu au moment de la requête.
  await connection();
  const products = await listAllProducts(db);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.12em] text-muted-ink">
              <th className="py-3 pr-4 font-medium">Ordre</th>
              <th className="py-3 pr-4 font-medium">Nom</th>
              <th className="py-3 pr-4 font-medium">SKU</th>
              <th className="py-3 pr-4 font-medium">Prix</th>
              <th className="py-3 pr-4 font-medium">Aux 100 ml</th>
              <th className="py-3 pr-4 font-medium">Poids</th>
              <th className="py-3 pr-4 font-medium">Stock</th>
              <th className="py-3 pr-4 font-medium">Statut</th>
              <th className="py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-line-soft">
                <td className="py-3 pr-4 tabular-nums text-muted-ink">
                  {p.position}
                </td>
                <td className="py-3 pr-4">{p.name}</td>
                <td className="py-3 pr-4 font-mono text-[12px] text-muted-ink">
                  {p.sku}
                </td>
                <td className="py-3 pr-4 tabular-nums">
                  {formatPrice(p.priceCents)}
                </td>
                <td className="py-3 pr-4 tabular-nums text-muted-ink">
                  {formatPricePer100ml(p.priceCents, p.volumeMl) ?? "—"}
                </td>
                <td className="py-3 pr-4 tabular-nums text-muted-ink">
                  {p.weightGrams} g
                </td>
                <td className="py-3 pr-4 tabular-nums">{p.stock}</td>
                <td className="py-3 pr-4">
                  <span
                    className={`px-2 py-1 text-[10px] uppercase tracking-[.12em] ${STATUS_STYLE[p.status]}`}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                </td>
                <td className="py-3">
                  <Link
                    href={`/admin/produits/${p.slug}`}
                    className="underline underline-offset-4"
                  >
                    Modifier
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {products.length === 0 && (
        <p className="mt-6 text-[13px] text-muted-ink">
          Aucun produit. Lancez <code>bun run db:seed</code>.
        </p>
      )}
    </>
  );
}
