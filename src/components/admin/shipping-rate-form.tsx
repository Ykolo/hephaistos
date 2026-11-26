"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteShippingRateAction, saveShippingRateAction } from "@/server/actions/admin-shipping";
import { CARRIER_LABELS, SHIPPING_METHOD_LABELS, SHIPPING_METHODS } from "@/lib/shipping";

const label = "mb-1.5 block text-[11px] uppercase tracking-[.12em] text-muted-ink";
const field =
  "w-full border border-line-strong bg-transparent px-3 py-2 text-[14px] outline-none focus:border-ink";
const hintCls = "mt-1 block text-[11px] leading-[1.5] text-muted-ink";

export type ShippingRateFormValues = {
  id: string;
  carrier: string;
  method: "HOME" | "PICKUP_POINT";
  maxWeight: string;
  price: string;
  freeAbove: string;
  active: boolean;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span role="alert" className="mt-1 block text-[11.5px] text-red-700">
      {message}
    </span>
  );
}

/**
 * Création et modification d'une tranche (HEP-70).
 *
 * `onSubmit` et non `<form action>` : React 19 viderait les champs après
 * l'envoi, et une erreur ferait tout ressaisir.
 */
export function ShippingRateForm({ initial }: { initial?: ShippingRateFormValues }) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const editing = Boolean(initial);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await saveShippingRateAction(data);
      if (result.ok) {
        setFields({});
        setFormError(null);
        setSaved(result.data.created ? "Tranche ajoutée." : "Tarif enregistré.");
        if (result.data.created) form.reset();
        router.refresh();
        return;
      }
      setFields(result.fields ?? {});
      setFormError(result.fields ? null : result.message);
      setSaved(null);
    });
  }

  return (
    <form onSubmit={onSubmit} className="mb-4 flex flex-col gap-4" noValidate>
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
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className={label} htmlFor="method">
            Mode
          </label>
          <select id="method" name="method" defaultValue={initial?.method ?? "PICKUP_POINT"} className={field}>
            {SHIPPING_METHODS.map((m) => (
              <option key={m} value={m}>
                {SHIPPING_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={label} htmlFor="carrier">
            Transporteur
          </label>
          <select id="carrier" name="carrier" defaultValue={initial?.carrier ?? "mondial_relay"} className={field}>
            {Object.entries(CARRIER_LABELS).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
          <FieldError message={fields.carrier} />
        </div>

        <div>
          <label className={label} htmlFor="maxWeight">
            Jusqu&apos;à (g)
          </label>
          <input id="maxWeight" name="maxWeight" inputMode="numeric" defaultValue={initial?.maxWeight} className={field} />
          <span className={hintCls}>Colis emballé, borne incluse.</span>
          <FieldError message={fields.maxWeight} />
        </div>

        <div>
          <label className={label} htmlFor="price">
            Prix (€ TTC)
          </label>
          <input id="price" name="price" inputMode="decimal" defaultValue={initial?.price} className={field} />
          <FieldError message={fields.price} />
        </div>

        <div>
          <label className={label} htmlFor="freeAbove">
            Offerte dès (€)
          </label>
          <input id="freeAbove" name="freeAbove" inputMode="decimal" defaultValue={initial?.freeAbove} className={field} />
          <span className={hintCls}>Remise déduite. Vide = jamais.</span>
          <FieldError message={fields.freeAbove} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} />
        Proposée aux clients
      </label>

      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer self-start border border-ink bg-ink px-9 py-3 text-[11.5px] font-semibold uppercase tracking-[.16em] text-white transition-colors hover:bg-paper hover:text-ink disabled:opacity-60"
      >
        {pending ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter la tranche"}
      </button>
    </form>
  );
}

/** Suppression d'une tranche, confirmée : elle disparaît du panier aussitôt. */
export function DeleteShippingRate({ id, description }: { id: string; description: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        aria-label={`Supprimer la tranche ${description}`}
        onClick={() => {
          if (!window.confirm(`Supprimer la tranche « ${description} » ?`)) return;
          startTransition(async () => {
            const result = await deleteShippingRateAction({ id });
            if (!result.ok) return setError(result.message);
            setError(null);
            router.refresh();
          });
        }}
        className="cursor-pointer bg-transparent text-[11.5px] text-muted-ink underline underline-offset-4 disabled:opacity-40"
      >
        Supprimer
      </button>
      {error && (
        <span role="alert" className="text-[11px] text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
