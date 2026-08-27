"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBatch } from "@/server/actions/admin-batches";

const label = "mb-1.5 block text-[11px] uppercase tracking-[.12em] text-muted-ink";
const field =
  "w-full border border-line-strong bg-transparent px-3 py-2 text-[14px] outline-none focus:border-ink";

export function BatchForm({
  products,
}: {
  products: { slug: string; name: string; sku: string }[];
}) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await saveBatch(formData);
      if (result.ok) {
        setFields({});
        setFormError(null);
        setSaved(`Lot enregistré. Stock du produit : ${result.data.stock}.`);
        // La liste des lots est rendue côté serveur : il faut la recharger
        // pour voir la nouvelle ligne.
        router.refresh();
        return;
      }
      setFields(result.fields ?? {});
      setFormError(result.fields ? null : result.message);
      setSaved(null);
    });
  }

  return (
    <form action={onSubmit} className="mb-10 flex flex-col gap-4" noValidate>
      {formError && (
        <p role="alert" className="m-0 text-[13px] text-red-700">
          {formError}
        </p>
      )}
      {saved && (
        <p role="status" className="m-0 text-[13px] text-green-700">
          {saved}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={label} htmlFor="productSlug">
            Produit
          </label>
          <select id="productSlug" name="productSlug" className={field}>
            {products.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name} — {p.sku}
              </option>
            ))}
          </select>
          {fields.productSlug && (
            <span role="alert" className="mt-1 block text-[11.5px] text-red-700">
              {fields.productSlug}
            </span>
          )}
        </div>

        <div>
          <label className={label} htmlFor="code">
            Numéro de lot
          </label>
          <input id="code" name="code" className={field} />
          {fields.code && (
            <span role="alert" className="mt-1 block text-[11.5px] text-red-700">
              {fields.code}
            </span>
          )}
        </div>

        <div>
          <label className={label} htmlFor="quantity">
            Quantité reçue
          </label>
          <input id="quantity" name="quantity" inputMode="numeric" className={field} />
          {fields.quantity && (
            <span role="alert" className="mt-1 block text-[11.5px] text-red-700">
              {fields.quantity}
            </span>
          )}
        </div>

        <div>
          <label className={label} htmlFor="expiresAt">
            Date limite (optionnel)
          </label>
          <input id="expiresAt" name="expiresAt" type="date" className={field} />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer self-start border border-ink bg-ink px-9 py-3 text-[11.5px] font-semibold uppercase tracking-[.16em] text-white transition-colors hover:bg-paper hover:text-ink disabled:opacity-60"
      >
        {pending ? "Enregistrement…" : "Enregistrer la réception"}
      </button>
    </form>
  );
}
