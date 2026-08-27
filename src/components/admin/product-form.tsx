"use client";

import { useState, useTransition } from "react";
import { saveProduct } from "@/server/actions/admin-products";
import { formatPricePer100ml } from "@/lib/format";

type Values = {
  id?: string;
  slug: string;
  sku: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  kind: string;
  status: string;
  availability: string;
  priceEuros: string;
  compareAtEuros: string;
  volumeMl: string;
  weightGrams: string;
  usage: string;
  inci: string;
  precautions: string;
  seoTitle: string;
  seoDescription: string;
};

const label = "mb-1.5 block text-[11px] uppercase tracking-[.12em] text-muted-ink";
const field =
  "w-full border border-line-strong bg-transparent px-3 py-2 text-[14px] outline-none focus:border-ink";
const errorCls = "mt-1 block text-[11.5px] text-red-700";

function Err({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} role="alert" className={errorCls}>
      {message}
    </span>
  );
}

export function ProductForm({ initial }: { initial: Values }) {
  const [values, setValues] = useState(initial);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof Values) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  };

  /**
   * Le prix aux 100 ml se **calcule**, il ne se saisit pas : un champ libre
   * finirait par diverger du prix réel, alors que son affichage est imposé
   * par le code de la consommation. Aperçu en direct pendant la saisie.
   */
  const preview = (() => {
    const euros = Number(values.priceEuros.replace(",", "."));
    const ml = Number(values.volumeMl);
    if (!Number.isFinite(euros) || euros <= 0 || !Number.isFinite(ml) || ml <= 0) {
      return null;
    }
    return formatPricePer100ml(Math.round(euros * 100), ml);
  })();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await saveProduct(formData);
      if (result.ok) {
        setFields({});
        setFormError(null);
        setSaved(true);
        return;
      }
      setFields(result.fields ?? {});
      setFormError(result.fields ? null : result.message);
      setSaved(false);
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-5" noValidate>
      {values.id && <input type="hidden" name="id" value={values.id} />}

      {formError && (
        <p role="alert" className="m-0 text-[13px] text-red-700">
          {formError}
        </p>
      )}
      {saved && (
        <p role="status" className="m-0 text-[13px] text-green-700">
          Enregistré. Le site public reflète le changement immédiatement.
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="name">
            Nom
          </label>
          <input
            id="name"
            name="name"
            className={field}
            value={values.name}
            onChange={(e) => set("name")(e.target.value)}
            aria-invalid={Boolean(fields.name)}
          />
          <Err id="name-error" message={fields.name} />
        </div>

        <div>
          <label className={label} htmlFor="sku">
            Référence SKU
          </label>
          <input
            id="sku"
            name="sku"
            className={field}
            value={values.sku}
            onChange={(e) => set("sku")(e.target.value)}
            aria-invalid={Boolean(fields.sku)}
          />
          <Err id="sku-error" message={fields.sku} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="slug">
          Identifiant d&apos;URL
        </label>
        <input
          id="slug"
          name="slug"
          className={field}
          value={values.slug}
          readOnly={Boolean(values.id)}
          onChange={(e) => set("slug")(e.target.value)}
          aria-invalid={Boolean(fields.slug)}
        />
        {values.id && (
          <span className="mt-1 block text-[11.5px] text-muted-ink">
            Figé après création : les liens et le référencement en dépendent.
          </span>
        )}
        <Err id="slug-error" message={fields.slug} />
      </div>

      <div>
        <label className={label} htmlFor="tagline">
          Accroche
        </label>
        <input
          id="tagline"
          name="tagline"
          className={field}
          value={values.tagline}
          onChange={(e) => set("tagline")(e.target.value)}
        />
        <Err id="tagline-error" message={fields.tagline} />
      </div>

      <div>
        <label className={label} htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          className={`${field} resize-y`}
          value={values.description}
          onChange={(e) => set("description")(e.target.value)}
          aria-invalid={Boolean(fields.description)}
        />
        <Err id="description-error" message={fields.description} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={label} htmlFor="category">
            Catégorie
          </label>
          <select
            id="category"
            name="category"
            className={field}
            value={values.category}
            onChange={(e) => set("category")(e.target.value)}
          >
            <option value="CLEANSING">Nettoyage</option>
            <option value="TREATMENT">Soin ciblé</option>
            <option value="HYDRATION">Hydratation</option>
          </select>
        </div>

        <div>
          <label className={label} htmlFor="kind">
            Type
          </label>
          <select
            id="kind"
            name="kind"
            className={field}
            value={values.kind}
            onChange={(e) => set("kind")(e.target.value)}
          >
            <option value="SIMPLE">Produit simple</option>
            <option value="BUNDLE">Coffret</option>
          </select>
          {values.kind === "BUNDLE" && (
            <span className="mt-1 block text-[11.5px] text-muted-ink">
              Stock calculé sur les composants — voir la composition plus bas.
            </span>
          )}
        </div>

        <div>
          <label className={label} htmlFor="status">
            Statut
          </label>
          <select
            id="status"
            name="status"
            className={field}
            value={values.status}
            onChange={(e) => set("status")(e.target.value)}
          >
            <option value="DRAFT">Brouillon</option>
            <option value="PUBLISHED">Publié</option>
            <option value="ARCHIVED">Archivé</option>
          </select>
        </div>

        <div>
          <label className={label} htmlFor="availability">
            Disponibilité
          </label>
          <select
            id="availability"
            name="availability"
            className={field}
            value={values.availability}
            onChange={(e) => set("availability")(e.target.value)}
          >
            <option value="COMING_SOON">Bientôt disponible</option>
            <option value="IN_STOCK">En stock</option>
            <option value="PREORDER">Précommande</option>
            <option value="OUT_OF_STOCK">Épuisé</option>
            <option value="DISCONTINUED">Arrêté</option>
          </select>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-4">
        <div>
          <label className={label} htmlFor="priceCents">
            Prix (€)
          </label>
          <input
            id="priceCents"
            name="priceCents"
            inputMode="decimal"
            className={field}
            value={values.priceEuros}
            onChange={(e) => set("priceEuros")(e.target.value)}
            aria-invalid={Boolean(fields.priceCents)}
          />
          <Err id="price-error" message={fields.priceCents} />
        </div>

        <div>
          <label className={label} htmlFor="compareAtCents">
            Prix barré (€)
          </label>
          <input
            id="compareAtCents"
            name="compareAtCents"
            inputMode="decimal"
            className={field}
            value={values.compareAtEuros}
            onChange={(e) => set("compareAtEuros")(e.target.value)}
            aria-invalid={Boolean(fields.compareAtCents)}
          />
          <Err id="compare-error" message={fields.compareAtCents} />
        </div>

        <div>
          <label className={label} htmlFor="volumeMl">
            Contenance (ml)
          </label>
          <input
            id="volumeMl"
            name="volumeMl"
            inputMode="numeric"
            className={field}
            value={values.volumeMl}
            onChange={(e) => set("volumeMl")(e.target.value)}
            aria-invalid={Boolean(fields.volumeMl)}
          />
          <Err id="volume-error" message={fields.volumeMl} />
        </div>

        <div>
          <label className={label} htmlFor="weightGrams">
            Poids emballé (g)
          </label>
          <input
            id="weightGrams"
            name="weightGrams"
            inputMode="numeric"
            className={field}
            value={values.weightGrams}
            onChange={(e) => set("weightGrams")(e.target.value)}
            aria-invalid={Boolean(fields.weightGrams)}
          />
          <span className="mt-1 block text-[11.5px] text-muted-ink">
            Détermine le tarif d&apos;expédition.
          </span>
          <Err id="weight-error" message={fields.weightGrams} />
        </div>
      </div>

      <p className="m-0 border-l-2 border-line-strong pl-3 text-[13px] text-body">
        Prix à l&apos;unité de mesure :{" "}
        <strong>{preview ?? "— renseignez prix et contenance"}</strong>
        <span className="mt-1 block text-[11.5px] text-muted-ink">
          Calculé, jamais saisi. Son affichage est obligatoire pour les produits
          vendus au volume.
        </span>
      </p>

      <div>
        <label className={label} htmlFor="usage">
          Conseils d&apos;utilisation
        </label>
        <textarea
          id="usage"
          name="usage"
          rows={3}
          className={`${field} resize-y`}
          value={values.usage}
          onChange={(e) => set("usage")(e.target.value)}
        />
      </div>

      <div>
        <label className={label} htmlFor="inci">
          Composition (INCI)
        </label>
        <textarea
          id="inci"
          name="inci"
          rows={3}
          className={`${field} resize-y`}
          value={values.inci}
          onChange={(e) => set("inci")(e.target.value)}
        />
      </div>

      <div>
        <label className={label} htmlFor="precautions">
          Précautions
        </label>
        <textarea
          id="precautions"
          name="precautions"
          rows={3}
          className={`${field} resize-y`}
          value={values.precautions}
          onChange={(e) => set("precautions")(e.target.value)}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="seoTitle">
            Titre SEO
          </label>
          <input
            id="seoTitle"
            name="seoTitle"
            className={field}
            value={values.seoTitle}
            onChange={(e) => set("seoTitle")(e.target.value)}
          />
          <Err id="seotitle-error" message={fields.seoTitle} />
        </div>
        <div>
          <label className={label} htmlFor="seoDescription">
            Description SEO
          </label>
          <input
            id="seoDescription"
            name="seoDescription"
            className={field}
            value={values.seoDescription}
            onChange={(e) => set("seoDescription")(e.target.value)}
          />
          <Err id="seodesc-error" message={fields.seoDescription} />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 cursor-pointer self-start border border-ink bg-ink px-9 py-3 text-[11.5px] font-semibold uppercase tracking-[.16em] text-white transition-colors hover:bg-paper hover:text-ink disabled:opacity-60"
      >
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
