"use client";

import { useState, useTransition } from "react";
import { saveBundleComposition } from "@/server/actions/admin-products";

export type ComponentChoice = {
  slug: string;
  name: string;
  sku: string;
  stock: number;
};

export type CompositionLine = { slug: string; qty: number };

const label = "mb-1.5 block text-[11px] uppercase tracking-[.12em] text-muted-ink";
const field =
  "w-full border border-line-strong bg-transparent px-3 py-2 text-[14px] outline-none focus:border-ink";

/**
 * Composition d'un coffret (HEP-40).
 *
 * Il n'y a **pas** de champ « stock du coffret » : celui-ci se calcule
 * (`min(stock du composant / quantité)`) et l'aperçu ci-dessous le montre en
 * direct. Un champ saisissable finirait par mentir dès la première vente.
 */
export function BundleComposition({
  bundleSlug,
  candidates,
  initial,
}: {
  bundleSlug: string;
  /** Produits simples seulement : les coffrets imbriqués sont interdits. */
  candidates: ComponentChoice[];
  initial: CompositionLine[];
}) {
  const [lines, setLines] = useState<CompositionLine[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const available = candidates.filter(
    (c) => !lines.some((l) => l.slug === c.slug),
  );

  const stockOf = (slug: string) =>
    candidates.find((c) => c.slug === slug)?.stock ?? 0;

  /** Le stock vendable, tel que le calculera le serveur. */
  const units =
    lines.length === 0
      ? 0
      : Math.min(...lines.map((l) => Math.floor(stockOf(l.slug) / Math.max(l.qty, 1))));

  function update(slug: string, qty: number) {
    setLines((ls) => ls.map((l) => (l.slug === slug ? { ...l, qty } : l)));
    setSaved(false);
  }

  function remove(slug: string) {
    setLines((ls) => ls.filter((l) => l.slug !== slug));
    setSaved(false);
  }

  function add(slug: string) {
    if (!slug) return;
    setLines((ls) => [...ls, { slug, qty: 1 }]);
    setSaved(false);
  }

  function save() {
    startTransition(async () => {
      const result = await saveBundleComposition({ bundleSlug, components: lines });
      if (result.ok) {
        setError(null);
        setSaved(true);
        return;
      }
      setError(result.message);
      setSaved(false);
    });
  }

  return (
    <section className="mt-10 border-t border-line pt-8">
      <h2 className="m-0 mb-2 font-serif text-[1.4rem] font-normal">
        Composition du coffret
      </h2>
      <p className="m-0 mb-6 text-[12.5px] leading-[1.6] text-muted-ink">
        Le coffret n&apos;a pas de stock propre : il consomme celui de ses
        composants. Vendre un coffret décrémente chaque référence ci-dessous.
      </p>

      {error && (
        <p role="alert" className="m-0 mb-4 text-[13px] text-red-700">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="m-0 mb-4 text-[13px] text-green-700">
          Composition enregistrée.
        </p>
      )}

      {lines.length === 0 ? (
        <p className="mb-5 text-[13px] text-muted-ink">
          Aucun composant — le coffret n&apos;est pas vendable en l&apos;état.
        </p>
      ) : (
        <table className="mb-5 w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.12em] text-muted-ink">
              <th className="py-2 pr-4 font-medium">Produit</th>
              <th className="py-2 pr-4 font-medium">Stock</th>
              <th className="py-2 pr-4 font-medium">Quantité</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const c = candidates.find((x) => x.slug === l.slug);
              return (
                <tr key={l.slug} className="border-b border-line-soft">
                  <td className="py-2 pr-4">
                    {c?.name ?? l.slug}
                    <span className="ml-2 font-mono text-[11px] text-muted-ink">
                      {c?.sku}
                    </span>
                  </td>
                  <td className="py-2 pr-4 tabular-nums text-muted-ink">
                    {stockOf(l.slug)}
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={l.qty}
                      onChange={(e) => update(l.slug, Number(e.target.value))}
                      aria-label={`Quantité de ${c?.name ?? l.slug}`}
                      className={`${field} w-20`}
                    />
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => remove(l.slug)}
                      className="cursor-pointer bg-transparent text-[12px] text-muted-ink underline underline-offset-4"
                    >
                      Retirer
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {available.length > 0 && (
        <div className="mb-6 max-w-[320px]">
          <label className={label} htmlFor="add-component">
            Ajouter un composant
          </label>
          <select
            id="add-component"
            className={field}
            value=""
            onChange={(e) => add(e.target.value)}
          >
            <option value="">Choisir un produit…</option>
            {available.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name} — stock {c.stock}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="m-0 mb-6 border-l-2 border-line-strong pl-3 text-[13px] text-body">
        Coffrets vendables : <strong>{units}</strong>
        <span className="mt-1 block text-[11.5px] text-muted-ink">
          Calculé, jamais saisi — le minimum sur les composants. Un seul
          composant en rupture rend le coffret indisponible.
        </span>
      </p>

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="cursor-pointer border border-ink bg-ink px-9 py-3 text-[11.5px] font-semibold uppercase tracking-[.16em] text-white transition-colors hover:bg-paper hover:text-ink disabled:opacity-60"
      >
        {pending ? "Enregistrement…" : "Enregistrer la composition"}
      </button>
    </section>
  );
}
