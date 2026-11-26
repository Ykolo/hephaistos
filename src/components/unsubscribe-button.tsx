"use client";

import { useState, useTransition } from "react";
import { unsubscribeNewsletter } from "@/server/actions/newsletter";

const RESULTS = {
  unsubscribed: "C'est fait : tu ne recevras plus nos mails.",
  already: "Cette adresse était déjà désinscrite.",
  invalid: "Ce lien n'est pas valide. Il a peut-être été coupé par ta messagerie.",
} as const;

/** Un clic, sans connexion (HEP-67). */
export function UnsubscribeButton({ token }: { token: string }) {
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (result) {
    return (
      <p role="status" className="m-0 text-[15px] leading-[1.7] text-body">
        {result}
      </p>
    );
  }

  return (
    <>
      <p className="m-0 mb-8 text-[15px] leading-[1.7] text-body">
        Tu ne recevras plus la newsletter Héphaïstos. Tes commandes, elles, continuent de t&apos;être
        confirmées par mail.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await unsubscribeNewsletter({ token });
            setResult(r.ok ? RESULTS[r.data.result] : r.message);
          })
        }
        className="cursor-pointer border border-ink bg-ink px-[34px] py-4 text-[11.5px] font-semibold uppercase tracking-[.18em] text-white transition-colors hover:bg-paper hover:text-ink disabled:opacity-60"
      >
        {pending ? "…" : "Me désinscrire"}
      </button>
    </>
  );
}
