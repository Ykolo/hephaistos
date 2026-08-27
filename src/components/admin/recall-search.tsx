"use client";

import { useState, useTransition } from "react";
import { searchRecall } from "@/server/actions/admin-batches";
import type { RecallResult } from "@/server/services/batches";

const field =
  "w-full border border-line-strong bg-transparent px-3 py-2 text-[14px] outline-none focus:border-ink";

type Result = RecallResult & { csv: string };

function Rows({
  rows,
  traced,
}: {
  rows: RecallResult["affected"];
  traced: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-[13px] text-muted-ink">
        {traced ? "Aucune commande tracée sur ce lot." : "Aucune ligne sans lot."}
      </p>
    );
  }
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.12em] text-muted-ink">
          <th className="py-2 pr-4 font-medium">Commande</th>
          <th className="py-2 pr-4 font-medium">Email</th>
          <th className="py-2 pr-4 font-medium">Produit</th>
          <th className="py-2 pr-4 font-medium">Qté</th>
          <th className="py-2 font-medium">Expédié le</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.orderNumber}-${r.productName}`} className="border-b border-line-soft">
            <td className="py-2 pr-4 font-mono text-[12px]">{r.orderNumber}</td>
            <td className="py-2 pr-4">{r.email}</td>
            <td className="py-2 pr-4">{r.productName}</td>
            <td className="py-2 pr-4 tabular-nums">{r.qty}</td>
            <td className="py-2 tabular-nums text-muted-ink">
              {r.shippedAt ? new Date(r.shippedAt).toLocaleDateString("fr-FR") : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RecallSearch() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function search() {
    startTransition(async () => {
      const r = await searchRecall({ code });
      if (r.ok) {
        setResult(r.data);
        setError(null);
        return;
      }
      setResult(null);
      setError(r.message);
    });
  }

  function download() {
    if (!result) return;
    // Le CSV vient du serveur : il contient exactement ce que l'écran montre.
    const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rappel-lot-${result.code}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end gap-3">
        <div className="max-w-[280px] flex-1">
          <label
            className="mb-1.5 block text-[11px] uppercase tracking-[.12em] text-muted-ink"
            htmlFor="recall-code"
          >
            Numéro de lot rappelé
          </label>
          <input
            id="recall-code"
            className={field}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
        </div>
        <button
          type="button"
          onClick={search}
          disabled={pending || !code.trim()}
          className="cursor-pointer border border-ink bg-ink px-8 py-[10px] text-[11.5px] font-semibold uppercase tracking-[.16em] text-white transition-colors hover:bg-paper hover:text-ink disabled:opacity-60"
        >
          {pending ? "Recherche…" : "Rechercher"}
        </button>
      </div>

      {error && (
        <p role="alert" className="m-0 mb-6 text-[13px] text-red-700">
          {error}
        </p>
      )}

      {result && (
        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-[13px]">
              Lot <strong>{result.code}</strong> — {result.productName} ·{" "}
              <strong>{result.affected.length}</strong> commande(s) tracée(s)
              {result.untraced.length > 0 && (
                <>
                  {" "}
                  · <strong>{result.untraced.length}</strong> sans lot
                </>
              )}
            </p>
            <button
              type="button"
              onClick={download}
              className="cursor-pointer border border-ink px-6 py-2 text-[11.5px] font-semibold uppercase tracking-[.16em] text-ink transition-colors hover:bg-ink hover:text-white"
            >
              Export CSV
            </button>
          </div>

          <h3 className="m-0 mb-3 text-[12px] font-semibold uppercase tracking-[.14em]">
            Clients concernés
          </h3>
          <div className="mb-8 overflow-x-auto">
            <Rows rows={result.affected} traced />
          </div>

          {result.untraced.length > 0 && (
            <div className="border border-gold/40 bg-gold/10 p-4">
              <h3 className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-[.14em]">
                Traçabilité incomplète — {result.untraced.length} ligne(s)
              </h3>
              <p className="m-0 mb-4 max-w-[70ch] text-[12.5px] leading-[1.6] text-body">
                Ces commandes portent le même produit mais <strong>aucun
                numéro de lot</strong> n&apos;a été saisi à la préparation. Il
                est impossible de dire si elles contiennent le lot rappelé :
                elles doivent être traitées comme potentiellement concernées.
                Elles figurent aussi dans l&apos;export.
              </p>
              <div className="overflow-x-auto">
                <Rows rows={result.untraced} traced={false} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
