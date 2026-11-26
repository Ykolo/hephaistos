"use client";

import { useState, useTransition } from "react";
import { submitContact } from "@/server/actions/contact";

const inputCls =
  "w-full border-0 border-b border-line-strong bg-transparent py-[11px] text-[15px] outline-none focus:border-ink";

const labelCls =
  "mb-2 block text-[11px] uppercase tracking-[.14em] text-muted-ink";

const errorCls = "mt-1 block text-[11.5px] leading-[1.5] text-red-700";

/** Message d'erreur rattaché à son champ, annoncé aux lecteurs d'écran. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} role="alert" className={errorCls}>
      {message}
    </span>
  );
}

type Values = {
  firstName: string;
  lastName: string;
  email: string;
  subject: string;
  body: string;
};

const EMPTY: Values = { firstName: "", lastName: "", email: "", subject: "", body: "" };

const BODY_MAX = 5000;

/**
 * Formulaire de contact (HEP-89).
 *
 * État contrôlé et `onSubmit`, pas `<form action>` : React 19 viderait les
 * champs à chaque envoi, et une seule erreur ferait retaper tout le message.
 */
export function ContactForm() {
  const [values, setValues] = useState<Values>(EMPTY);
  const [website, setWebsite] = useState("");
  const [sent, setSent] = useState<{ replyDelay: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div role="status" className="flex h-full flex-col justify-center bg-sand px-9 py-12 text-center">
        <div className="mb-[14px] font-serif text-[1.8rem]">Message envoyé.</div>
        <p className="m-0 text-[14px] leading-[1.7] text-body">
          Merci — on te répond {sent.replyDelay}. Un accusé de réception vient de partir à ton
          adresse.
        </p>
      </div>
    );
  }

  function update(name: keyof Values, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
    // L'erreur d'un champ disparaît dès qu'on le corrige.
    if (fields[name]) {
      setFields((current) => {
        const rest = { ...current };
        delete rest[name];
        return rest;
      });
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    for (const [k, v] of Object.entries(values)) data.set(k, v);
    data.set("website", website);

    startTransition(async () => {
      try {
        const result = await submitContact(data);
        if (result.ok) {
          setFields({});
          setFormError(null);
          setValues(EMPTY);
          setSent({ replyDelay: result.data.replyDelay });
          return;
        }
        // Les erreurs de validation retournent au champ concerné ; les
        // erreurs métier (robot détecté, quota dépassé) n'ont pas de champ et
        // s'affichent en tête de formulaire.
        setFields(result.fields ?? {});
        setFormError(result.fields ? null : result.message);
      } catch {
        // Réseau coupé, serveur injoignable : le message n'est pas parti, et
        // le texte reste dans les champs pour un nouvel essai.
        setFormError("L'envoi n'a pas abouti. Vérifie ta connexion et réessaie.");
      }
    });
  }

  function field(name: keyof Values) {
    return {
      id: name,
      name,
      value: values[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(name, e.target.value),
      "aria-invalid": Boolean(fields[name]) || undefined,
      "aria-describedby": fields[name] ? `${name}-error` : undefined,
    };
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-[18px]" noValidate aria-busy={pending}>
      {formError && (
        <p role="alert" className="m-0 text-[12.5px] text-red-700">
          {formError}
        </p>
      )}

      <div className="grid grid-cols-2 gap-[18px]">
        <div>
          <label className={labelCls} htmlFor="firstName">
            Prénom
          </label>
          <input {...field("firstName")} type="text" autoComplete="given-name" maxLength={80} className={inputCls} />
          <FieldError id="firstName-error" message={fields.firstName} />
        </div>
        <div>
          <label className={labelCls} htmlFor="lastName">
            Nom
          </label>
          <input {...field("lastName")} type="text" autoComplete="family-name" maxLength={80} className={inputCls} />
          <FieldError id="lastName-error" message={fields.lastName} />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="email">
          Email
        </label>
        <input {...field("email")} type="email" autoComplete="email" maxLength={254} className={inputCls} />
        <FieldError id="email-error" message={fields.email} />
      </div>

      <div>
        <label className={labelCls} htmlFor="subject">
          Sujet
        </label>
        <input {...field("subject")} type="text" maxLength={150} className={inputCls} />
        <FieldError id="subject-error" message={fields.subject} />
      </div>

      <div>
        <label className={labelCls} htmlFor="body">
          Message
        </label>
        <textarea {...field("body")} rows={5} maxLength={BODY_MAX} className={`${inputCls} resize-y`} />
        <FieldError id="body-error" message={fields.body} />
        {values.body.length > BODY_MAX * 0.8 && (
          <span className="mt-1 block text-right text-[11px] text-muted-ink">
            {values.body.length} / {BODY_MAX}
          </span>
        )}
      </div>

      {/* Piège à robots : hors flux et hors tabulation, jamais vu par un humain. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <button
        type="submit"
        disabled={pending}
        className="mt-3 cursor-pointer self-start border border-ink bg-ink px-11 py-[17px] text-[11.5px] font-semibold uppercase tracking-[.18em] text-white transition-colors hover:bg-paper hover:text-ink disabled:cursor-default disabled:opacity-60"
      >
        {pending ? "Envoi…" : "Envoyer"}
      </button>
    </form>
  );
}
