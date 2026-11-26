"use client";

import { useId, useState } from "react";
import { Reveal } from "@/components/reveal";
import type { NewsletterSource } from "@/server/services/newsletter";

/**
 * Formulaire d'inscription à la newsletter (HEP-67), partagé par le bandeau
 * et la page `/newsletter`.
 *
 * Le succès ne dit pas « tu es inscrit » mais « confirme dans ta boîte » :
 * c'est le double opt-in. Et il est identique pour une adresse déjà connue —
 * le serveur ne révèle rien.
 */
export function NewsletterForm({
  source,
  tone,
}: {
  source: NewsletterSource;
  /** `light` sur fond sable, `dark` sur fond noir. */
  tone: "light" | "dark";
}) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "pending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const dark = tone === "dark";

  if (state === "sent") {
    return (
      <Reveal>
        <div role="status" className={`font-serif text-[1.4rem] ${dark ? "text-cream-bright" : "text-ink"}`}>
          Plus qu&apos;une étape. ✦
        </div>
        <p className={`m-0 mt-3 text-[14px] leading-[1.7] ${dark ? "text-dust-soft" : "text-body"}`}>
          Un mail de confirmation vient de partir. Clique sur le lien qu&apos;il contient pour
          rejoindre la liste.
        </p>
      </Reveal>
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("pending");
    setError(null);
    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source, website }),
      });
      const result = (await response.json()) as
        | { ok: true }
        | { ok: false; message: string; fields?: Record<string, string> };
      if (result.ok) {
        setState("sent");
        return;
      }
      setError(result.fields?.email ?? result.message);
    } catch {
      setError("L'inscription n'a pas abouti. Vérifie ta connexion et réessaie.");
    }
    setState("idle");
  }

  return (
    <Reveal>
      <form
        onSubmit={onSubmit}
        noValidate
        aria-busy={state === "pending"}
        className={`mx-auto flex max-w-[440px] border-b ${dark ? "border-[#3a3a3a]" : "border-ink"}`}
      >
        <label htmlFor={`${errorId}-email`} className="sr-only">
          Adresse email
        </label>
        <input
          id={`${errorId}-email`}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          required
          maxLength={254}
          placeholder="Ton adresse email"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? errorId : undefined}
          className={`min-w-0 flex-1 bg-transparent px-1 py-4 text-[15px] outline-none ${dark ? "text-cream" : "text-ink"}`}
        />
        {/* Piège à robots : hors flux et hors tabulation. */}
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
          disabled={state === "pending"}
          className={`cursor-pointer bg-transparent px-2 text-[11.5px] font-semibold uppercase tracking-[.18em] disabled:opacity-50 ${dark ? "text-cream" : "text-ink"}`}
        >
          {state === "pending" ? "…" : "M'inscrire →"}
        </button>
      </form>
      {error && (
        <p id={errorId} role="alert" className="m-0 mt-2 text-[12.5px] text-red-600">
          {error}
        </p>
      )}
    </Reveal>
  );
}
