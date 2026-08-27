import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/server/db";
import { listBatches } from "@/server/services/batches";
import { BatchForm } from "@/components/admin/batch-form";

export default function BatchesPage() {
  return (
    <div>
      <h1 className="m-0 mb-2 font-serif text-[1.8rem] font-normal">
        Lots de fabrication
      </h1>
      <p className="m-0 mb-8 max-w-[70ch] text-[12.5px] leading-[1.6] text-muted-ink">
        Chaque réception de marchandise crée un lot et met le stock à jour. Le
        lot est ensuite saisi <strong>à la préparation du colis</strong>, pas à
        la commande : c&apos;est le geste d&apos;emballage qui fait foi.
      </p>

      <Suspense
        fallback={<p className="text-[13px] text-muted-ink">Chargement…</p>}
      >
        <BatchesContent />
      </Suspense>
    </div>
  );
}

async function BatchesContent() {
  await connection();

  const [products, batches] = await Promise.all([
    // Un coffret ne porte pas de lot : il est assemblé à partir de références
    // qui, elles, en ont un.
    db.product.findMany({
      where: { kind: "SIMPLE" },
      orderBy: { position: "asc" },
      select: { slug: true, name: true, sku: true },
    }),
    listBatches(db),
  ]);

  return (
    <>
      <BatchForm products={products} />

      <h2 className="m-0 mb-4 font-serif text-[1.3rem] font-normal">
        Lots enregistrés
      </h2>

      {batches.length === 0 ? (
        <p className="text-[13px] text-muted-ink">
          Aucun lot enregistré pour le moment.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.12em] text-muted-ink">
                <th className="py-2 pr-4 font-medium">Lot</th>
                <th className="py-2 pr-4 font-medium">Produit</th>
                <th className="py-2 pr-4 font-medium">Quantité</th>
                <th className="py-2 pr-4 font-medium">Date limite</th>
                <th className="py-2 font-medium">Reçu le</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-b border-line-soft">
                  <td className="py-2 pr-4 font-mono text-[12px]">{b.code}</td>
                  <td className="py-2 pr-4">{b.product.name}</td>
                  <td className="py-2 pr-4 tabular-nums">{b.quantity}</td>
                  <td className="py-2 pr-4 tabular-nums text-muted-ink">
                    {b.expiresAt
                      ? b.expiresAt.toLocaleDateString("fr-FR")
                      : "—"}
                  </td>
                  <td className="py-2 tabular-nums text-muted-ink">
                    {b.createdAt.toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
