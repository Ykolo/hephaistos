"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDiscountCode, toggleDiscountCode } from "@/server/actions/admin-discounts";

const label = "mb-1.5 block text-[11px] uppercase tracking-[.12em] text-muted-ink";
const field =
  "w-full border border-line-strong bg-transparent px-3 py-2 text-[14px] outline-none focus:border-ink";
const hintCls = "mt-1 block text-[11px] leading-[1.5] text-muted-ink";

export type DiscountFormValues = {
  id: string;
  code: string;
  type: "FIXED" | "PERCENT" | "FREE_SHIPPING";
  value: string;
  minOrder: string;
  productSlug: string;
  startsOn: string;
  endsOn: string;
  maxUses: string;
  maxUsesPerCustomer: string;
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
 * Création et modification d'un code (HEP-75).
 *
 * `onSubmit` et non `<form action>` : React 19 viderait les champs après
 * l'envoi, et une seule erreur ferait ressaisir tout le formulaire.
 */
export function DiscountForm({
  products,
  initial,
}: {
  products: { slug: string; name: string }[];
  initial?: DiscountFormValues;
}) {
  const [type, setType] = useState<DiscountFormValues["type"]>(initial?.type ?? "PERCENT");
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
      const result = await saveDiscountCode(data);
      if (result.ok) {
        setFields({});
        setFormError(null);
        setSaved(result.data.created ? `Code ${result.data.code} créé.` : `Code ${result.data.code} enregistré.`);
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={label} htmlFor="code">
            Code
          </label>
          <input
            id="code"
            name="code"
            defaultValue={initial?.code}
            readOnly={editing}
            autoCapitalize="characters"
            spellCheck={false}
            className={`${field} font-mono uppercase ${editing ? "text-muted-ink" : ""}`}
          />
          {editing && <span className={hintCls}>Le code ne change plus après création.</span>}
          <FieldError message={fields.code} />
        </div>

        <div>
          <label className={label} htmlFor="type">
            Type
          </label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as DiscountFormValues["type"])}
            className={field}
          >
            <option value="PERCENT">Pourcentage</option>
            <option value="FIXED">Montant fixe</option>
            <option value="FREE_SHIPPING">Livraison offerte</option>
          </select>
        </div>

        {type !== "FREE_SHIPPING" && (
          <div>
            <label className={label} htmlFor="value">
              {type === "PERCENT" ? "Remise (%)" : "Remise (€)"}
            </label>
            <input
              id="value"
              name="value"
              inputMode="decimal"
              defaultValue={initial?.type === type ? initial.value : ""}
              className={field}
            />
            <FieldError message={fields.value} />
          </div>
        )}

        <div>
          <label className={label} htmlFor="productSlug">
            Portée
          </label>
          <select id="productSlug" name="productSlug" defaultValue={initial?.productSlug ?? ""} className={field}>
            <option value="">Tout le panier</option>
            {products.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name} uniquement
              </option>
            ))}
          </select>
          <FieldError message={fields.productSlug} />
        </div>

        <div>
          <label className={label} htmlFor="minOrder">
            Minimum de commande (€)
          </label>
          <input id="minOrder" name="minOrder" inputMode="decimal" defaultValue={initial?.minOrder} className={field} />
          <span className={hintCls}>Vide = aucun minimum.</span>
          <FieldError message={fields.minOrder} />
        </div>

        <div>
          <label className={label} htmlFor="startsOn">
            Valable dès le
          </label>
          <input id="startsOn" name="startsOn" type="date" defaultValue={initial?.startsOn} className={field} />
          <FieldError message={fields.startsOn} />
        </div>

        <div>
          <label className={label} htmlFor="endsOn">
            Jusqu&apos;au (inclus)
          </label>
          <input id="endsOn" name="endsOn" type="date" defaultValue={initial?.endsOn} className={field} />
          <span className={hintCls}>Heure de Paris, jusqu&apos;à minuit.</span>
          <FieldError message={fields.endsOn} />
        </div>

        <div>
          <label className={label} htmlFor="maxUses">
            Utilisations au total
          </label>
          <input id="maxUses" name="maxUses" inputMode="numeric" defaultValue={initial?.maxUses} className={field} />
          <span className={hintCls}>Vide = illimité. 1 = code à usage unique.</span>
          <FieldError message={fields.maxUses} />
        </div>

        <div>
          <label className={label} htmlFor="maxUsesPerCustomer">
            Par client
          </label>
          <input
            id="maxUsesPerCustomer"
            name="maxUsesPerCustomer"
            inputMode="numeric"
            defaultValue={initial?.maxUsesPerCustomer ?? "1"}
            className={field}
          />
          <span className={hintCls}>Reconnu à l&apos;adresse email.</span>
          <FieldError message={fields.maxUsesPerCustomer} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} />
        Actif
      </label>

      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer self-start border border-ink bg-ink px-9 py-3 text-[11.5px] font-semibold uppercase tracking-[.16em] text-white transition-colors hover:bg-paper hover:text-ink disabled:opacity-60"
      >
        {pending ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le code"}
      </button>
    </form>
  );
}

/** Suspendre / réactiver, sans passer par le formulaire. */
export function DiscountToggle({ id, active }: { id: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-start gap-1">
      <span className={active ? "text-green-700" : "text-muted-ink"}>{active ? "Actif" : "Suspendu"}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await toggleDiscountCode({ id, active: !active });
            if (!result.ok) return setError(result.message);
            setError(null);
            router.refresh();
          })
        }
        className="cursor-pointer bg-transparent text-[11.5px] text-muted-ink underline underline-offset-4 disabled:opacity-40"
      >
        {active ? "Suspendre" : "Réactiver"}
      </button>
      {error && (
        <span role="alert" className="text-[11px] text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
