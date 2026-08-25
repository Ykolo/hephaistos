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

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className="flex h-full flex-col justify-center bg-sand px-9 py-12 text-center">
        <div className="mb-[14px] font-serif text-[1.8rem]">
          Message envoyé.
        </div>
        <p className="m-0 text-[14px] leading-[1.7] text-body">
          Merci — on revient vers toi très vite.
        </p>
      </div>
    );
  }

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await submitContact(formData);
      if (result.ok) {
        setFields({});
        setFormError(null);
        setSent(true);
        return;
      }
      // Les erreurs de validation retournent au champ concerné ; les erreurs
      // métier (robot détecté, quota dépassé) n'ont pas de champ et
      // s'affichent en tête de formulaire.
      setFields(result.fields ?? {});
      setFormError(result.fields ? null : result.message);
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-[18px]" noValidate>
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
          <input
            id="firstName"
            name="firstName"
            type="text"
            className={inputCls}
            aria-invalid={Boolean(fields.firstName)}
            aria-describedby={fields.firstName ? "firstName-error" : undefined}
          />
          <FieldError id="firstName-error" message={fields.firstName} />
        </div>
        <div>
          <label className={labelCls} htmlFor="lastName">
            Nom
          </label>
          <input
            id="lastName"
            name="lastName"
            type="text"
            className={inputCls}
            aria-invalid={Boolean(fields.lastName)}
            aria-describedby={fields.lastName ? "lastName-error" : undefined}
          />
          <FieldError id="lastName-error" message={fields.lastName} />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className={inputCls}
          aria-invalid={Boolean(fields.email)}
          aria-describedby={fields.email ? "email-error" : undefined}
        />
        <FieldError id="email-error" message={fields.email} />
      </div>

      <div>
        <label className={labelCls} htmlFor="subject">
          Sujet
        </label>
        <input
          id="subject"
          name="subject"
          type="text"
          className={inputCls}
          aria-invalid={Boolean(fields.subject)}
          aria-describedby={fields.subject ? "subject-error" : undefined}
        />
        <FieldError id="subject-error" message={fields.subject} />
      </div>

      <div>
        <label className={labelCls} htmlFor="body">
          Message
        </label>
        <textarea
          id="body"
          name="body"
          rows={4}
          className={`${inputCls} resize-y`}
          aria-invalid={Boolean(fields.body)}
          aria-describedby={fields.body ? "body-error" : undefined}
        />
        <FieldError id="body-error" message={fields.body} />
      </div>

      {/* Piège à robots : hors flux et hors tabulation, jamais vu par un humain. */}
      <input
        type="text"
        name="website"
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
