"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMessageStatusAction } from "@/server/actions/admin-messages";

type Status = "NEW" | "READ" | "ANSWERED" | "ARCHIVED" | "SPAM";

const ACTIONS: { status: Status; label: string }[] = [
  { status: "ANSWERED", label: "Marquer répondu" },
  { status: "ARCHIVED", label: "Archiver" },
  { status: "SPAM", label: "Spam" },
  { status: "NEW", label: "Marquer non lu" },
];

/** Changement d'état d'un message ouvert (HEP-89). */
export function MessageActions({ id, status }: { id: string; status: Status }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function change(next: Status) {
    startTransition(async () => {
      const result = await setMessageStatusAction({ id, status: next });
      if (!result.ok) return setError(result.message);
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      {ACTIONS.filter((a) => a.status !== status).map((a) => (
        <button
          key={a.status}
          type="button"
          disabled={pending}
          onClick={() => change(a.status)}
          className="cursor-pointer bg-transparent text-[12px] text-muted-ink underline underline-offset-4 disabled:opacity-40"
        >
          {a.label}
        </button>
      ))}
      {error && (
        <span role="alert" className="text-[12px] text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * Ouvrir un message nouveau le marque lu.
 *
 * Fait côté navigateur, après l'affichage : une page serveur qui écrit en
 * base pendant son rendu serait rejouée par un préchargement de lien, et
 * marquerait lus des messages que personne n'a ouverts.
 */
export function MarkAsRead({ id }: { id: string }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void setMessageStatusAction({ id, status: "READ" }).then((r) => {
      if (r.ok) router.refresh();
    });
  }, [id, router]);
  return null;
}
