"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCompanySettingsAction } from "@/server/actions/admin-company";
import { countryName, type CompanyInfo } from "@/lib/company";
import { SHIPPABLE_COUNTRIES } from "@/lib/validation/company";

const label = "mb-1.5 block text-[11px] uppercase tracking-[.12em] text-muted-ink";
const field =
  "w-full border border-line-strong bg-transparent px-3 py-2 text-[14px] outline-none focus:border-ink";
const hintCls = "mt-1 block text-[11px] leading-[1.5] text-muted-ink";

function FieldError({ name, message }: { name: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={`${name}-error`} role="alert" className="mt-1 block text-[11.5px] text-red-700">
      {message}
    </span>
  );
}

function euros(cents: number): string {
  return String(cents / 100).replace(".", ",");
}

/**
 * Réglages entreprise (HEP-80).
 *
 * `onSubmit` et non `<form action>` : React 19 viderait les champs après
 * l'envoi, et un SIRET refusé ferait tout ressaisir.
 */
export function CompanyForm({ initial }: { initial: CompanyInfo }) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await saveCompanySettingsAction(data);
      if (result.ok) {
        setFields({});
        setFormError(null);
        setSaved(
          result.data.changed.length === 0
            ? "Aucun changement."
            : "Réglages enregistrés. Mentions légales et pied de page sont à jour.",
        );
        router.refresh();
        return;
      }
      setFields(result.fields ?? {});
      setFormError(result.fields ? "Certains champs sont à corriger." : result.message);
      setSaved(null);
    });
  }

  function input(name: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) {
    return (
      <input
        id={name}
        name={name}
        aria-invalid={Boolean(fields[name]) || undefined}
        aria-describedby={fields[name] ? `${name}-error` : undefined}
        className={field}
        {...props}
      />
    );
  }

  const section = "mb-8 grid gap-4 sm:grid-cols-2";
  const h2 = "m-0 mb-4 font-serif text-[1.3rem] font-normal sm:col-span-2";

  return (
    <form onSubmit={onSubmit} noValidate>
      {formError && (
        <p role="alert" className="m-0 mb-4 text-[13px] text-red-700">
          {formError}
        </p>
      )}

      <fieldset className={`${section} border-0 p-0`}>
        <legend className={h2}>Société</legend>
        <div>
          <label className={label} htmlFor="legalName">
            Raison sociale
          </label>
          {input("legalName", { defaultValue: initial.legalName })}
          <FieldError name="legalName" message={fields.legalName} />
        </div>
        <div>
          <label className={label} htmlFor="legalForm">
            Forme juridique
          </label>
          {input("legalForm", { defaultValue: initial.legalForm ?? "", placeholder: "SAS, SASU, SARL…" })}
          <FieldError name="legalForm" message={fields.legalForm} />
        </div>
        <div>
          <label className={label} htmlFor="shareCapital">
            Capital social (€)
          </label>
          {input("shareCapital", {
            defaultValue: initial.shareCapitalCents != null ? euros(initial.shareCapitalCents) : "",
            inputMode: "decimal",
          })}
          <FieldError name="shareCapital" message={fields.shareCapital} />
        </div>
        <div>
          <label className={label} htmlFor="publicationDirector">
            Directeur de la publication
          </label>
          {input("publicationDirector", { defaultValue: initial.publicationDirector ?? "" })}
          <FieldError name="publicationDirector" message={fields.publicationDirector} />
        </div>
        <div>
          <label className={label} htmlFor="siret">
            SIRET
          </label>
          {input("siret", { defaultValue: initial.siret ?? "", inputMode: "numeric", autoComplete: "off" })}
          <span className={hintCls}>14 chiffres, espaces acceptés. La clé est vérifiée.</span>
          <FieldError name="siret" message={fields.siret} />
        </div>
        <div>
          <label className={label} htmlFor="vatNumber">
            TVA intracommunautaire
          </label>
          {input("vatNumber", { defaultValue: initial.vatNumber ?? "", autoComplete: "off", placeholder: "FR…" })}
          <span className={hintCls}>FR, clé à 2 chiffres, puis le SIREN.</span>
          <FieldError name="vatNumber" message={fields.vatNumber} />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="rcs">
            RCS
          </label>
          {input("rcs", { defaultValue: initial.rcs ?? "", placeholder: "RCS Paris 123 456 789" })}
          <FieldError name="rcs" message={fields.rcs} />
        </div>
      </fieldset>

      <fieldset className={`${section} border-0 p-0`}>
        <legend className={h2}>Siège et contact</legend>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="line1">
            Adresse
          </label>
          {input("line1", { defaultValue: initial.address.line1, autoComplete: "address-line1" })}
          <FieldError name="line1" message={fields.line1} />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="line2">
            Complément
          </label>
          {input("line2", { defaultValue: initial.address.line2 ?? "", autoComplete: "address-line2" })}
        </div>
        <div>
          <label className={label} htmlFor="postalCode">
            Code postal
          </label>
          {input("postalCode", { defaultValue: initial.address.postalCode, inputMode: "numeric" })}
          <FieldError name="postalCode" message={fields.postalCode} />
        </div>
        <div>
          <label className={label} htmlFor="city">
            Ville
          </label>
          {input("city", { defaultValue: initial.address.city })}
          <FieldError name="city" message={fields.city} />
        </div>
        <div>
          <label className={label} htmlFor="country">
            Pays
          </label>
          <select id="country" name="country" defaultValue={initial.address.country} className={field}>
            {(["FR", "BE", "LU", "MC"] as const).map((c) => (
              <option key={c} value={c}>
                {countryName(c)}
              </option>
            ))}
          </select>
        </div>
        <div />
        <div>
          <label className={label} htmlFor="contactEmail">
            Email de contact
          </label>
          {input("contactEmail", { defaultValue: initial.contactEmail, type: "email" })}
          <FieldError name="contactEmail" message={fields.contactEmail} />
        </div>
        <div>
          <label className={label} htmlFor="contactPhone">
            Téléphone
          </label>
          {input("contactPhone", { defaultValue: initial.contactPhone ?? "", type: "tel" })}
          <FieldError name="contactPhone" message={fields.contactPhone} />
        </div>
      </fieldset>

      <fieldset className={`${section} border-0 p-0`}>
        <legend className={h2}>Vente</legend>
        <div>
          <label className={label} htmlFor="vatRate">
            Taux de TVA (%)
          </label>
          {input("vatRate", { defaultValue: String(initial.vatRate / 100).replace(".", ","), inputMode: "decimal" })}
          <span className={hintCls}>
            S&apos;applique aux paniers et aux nouvelles commandes. Une commande passée garde le sien.
          </span>
          <FieldError name="vatRate" message={fields.vatRate} />
        </div>
        <div>
          <span className={label}>Devise</span>
          <p className="m-0 py-2 text-[14px]">{initial.currency} — euro, seule devise acceptée par la boutique.</p>
        </div>
        <fieldset className="border-0 p-0 sm:col-span-2" aria-describedby={fields.shipsTo ? "shipsTo-error" : undefined}>
          <legend className={label}>Pays livrés</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {SHIPPABLE_COUNTRIES.map((c) => (
              <label key={c} className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="shipsTo" value={c} defaultChecked={initial.shipsTo.includes(c)} />
                {countryName(c)}
              </label>
            ))}
          </div>
          <span className={hintCls}>
            Repris dans les CGV. La grille de port (Livraison) ne couvre aujourd&apos;hui que la France.
          </span>
          <FieldError name="shipsTo" message={fields.shipsTo} />
        </fieldset>
      </fieldset>

      <fieldset className={`${section} border-0 p-0`}>
        <legend className={h2}>Hébergeur</legend>
        <div>
          <label className={label} htmlFor="hostName">
            Nom
          </label>
          {input("hostName", { defaultValue: initial.hostName })}
          <FieldError name="hostName" message={fields.hostName} />
        </div>
        <div>
          <label className={label} htmlFor="hostAddress">
            Adresse
          </label>
          {input("hostAddress", { defaultValue: initial.hostAddress })}
          <FieldError name="hostAddress" message={fields.hostAddress} />
        </div>
      </fieldset>

      {saved && (
        <p role="status" className="m-0 mb-4 text-[13px] text-green-700">
          {saved}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer border border-ink bg-ink px-9 py-3 text-[11.5px] font-semibold uppercase tracking-[.16em] text-white transition-colors hover:bg-paper hover:text-ink disabled:opacity-60"
      >
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
