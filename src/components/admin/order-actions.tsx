"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelOrderFromAdmin,
  changeOrderStatus,
  saveOrderNote,
} from "@/server/actions/admin-orders";
import type { ADMIN_SETTABLE_STATUSES } from "@/lib/validation/admin-order";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";

type SettableStatus = (typeof ADMIN_SETTABLE_STATUSES)[number];

const field =
  "w-full border border-line-strong bg-transparent px-3 py-2 text-[14px] outline-none focus:border-ink";
const label = "mb-1.5 block text-[11px] uppercase tracking-[.12em] text-muted-ink";
const primary =
  "cursor-pointer border border-ink bg-ink px-6 py-[10px] text-[11.5px] font-semibold uppercase tracking-[.16em] text-white transition-colors hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-50";
const secondary =
  "cursor-pointer border border-ink px-6 py-[10px] text-[11.5px] font-semibold uppercase tracking-[.16em] text-ink transition-colors hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-50";
const heading = "m-0 mb-3 text-[12px] font-semibold uppercase tracking-[.14em]";

type Result = { ok: true } | { ok: false; message: string };

/** Lance une action, puis recharge la fiche : le journal doit refléter l'écriture. */
function useOrderMutation() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  function run(mutation: () => Promise<Result>, success: string) {
    startTransition(async () => {
      const r = await mutation();
      setFeedback(r.ok ? { ok: true, text: success } : { ok: false, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  return { pending, feedback, run };
}

function Feedback({ value }: { value: { ok: boolean; text: string } | null }) {
  if (!value) return null;
  return (
    <p
      role={value.ok ? "status" : "alert"}
      className={`m-0 mt-2 text-[12.5px] ${value.ok ? "text-muted-ink" : "text-red-700"}`}
    >
      {value.text}
    </p>
  );
}

export function OrderStatusForm({
  orderId,
  next,
}: {
  orderId: string;
  next: SettableStatus[];
}) {
  const [chosen, setTo] = useState<SettableStatus | "">(next[0] ?? "");
  // Après une transition, la fiche se recharge et `next` change : l'état choisi
  // n'est alors plus proposé. Le garder renverrait l'ancien état au clic
  // suivant — un faux succès, puisque le service ignore un état déjà atteint.
  const to = chosen && next.includes(chosen) ? chosen : (next[0] ?? "");
  const [note, setNote] = useState("");
  const { pending, feedback, run } = useOrderMutation();

  if (next.length === 0) {
    return (
      <section>
        <h3 className={heading}>Changer d&apos;état</h3>
        <p className="m-0 text-[12.5px] text-muted-ink">
          Aucun changement manuel possible depuis cet état.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h3 className={heading}>Changer d&apos;état</h3>
      <div className="grid gap-3">
        <select
          aria-label="Nouvel état"
          className={field}
          value={to}
          onChange={(e) => setTo(e.target.value as SettableStatus)}
        >
          {next.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <input
          aria-label="Note pour le journal"
          className={field}
          placeholder="Note pour le journal (n° de suivi…)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="button"
          className={primary}
          disabled={pending || !to}
          onClick={() =>
            to &&
            run(async () => {
              const r = await changeOrderStatus({ orderId, to, note });
              if (r.ok) setNote("");
              return r;
            }, `Commande passée « ${ORDER_STATUS_LABEL[to]} ».`)
          }
        >
          {pending ? "Enregistrement…" : "Appliquer"}
        </button>
      </div>
      <Feedback value={feedback} />
    </section>
  );
}

export function OrderNoteForm({ orderId, initial }: { orderId: string; initial: string }) {
  const [note, setNote] = useState(initial);
  const { pending, feedback, run } = useOrderMutation();

  return (
    <section>
      <label className={heading + " block"} htmlFor="internal-note">
        Note interne
      </label>
      <p className="m-0 mb-2 text-[12px] text-muted-ink">
        Jamais visible du client : ni suivi, ni mail, ni facture.
      </p>
      <textarea
        id="internal-note"
        rows={4}
        className={field}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button
        type="button"
        className={`${secondary} mt-3`}
        disabled={pending || note === initial}
        onClick={() => run(() => saveOrderNote({ orderId, note }), "Note enregistrée.")}
      >
        {pending ? "Enregistrement…" : "Enregistrer la note"}
      </button>
      <Feedback value={feedback} />
    </section>
  );
}

export function OrderCancelForm({
  orderId,
  cancelable,
  paid,
  shipped,
}: {
  orderId: string;
  /** Avant expédition seulement — après, c'est un retour (lot 7). */
  cancelable: boolean;
  /** Une commande encaissée ne s'annule pas sans remboursement. */
  paid: boolean;
  /** Colis parti : seul un retour peut encore défaire la vente. */
  shipped: boolean;
}) {
  const [reason, setReason] = useState("");
  const { pending, feedback, run } = useOrderMutation();

  return (
    <section className="border border-line p-4">
      <h3 className={heading}>Annuler ou rembourser</h3>

      {!cancelable ? (
        <p className="m-0 text-[12.5px] text-muted-ink">
          {shipped
            ? "Cette commande est partie : elle ne s'annule plus, elle passe par une demande de retour."
            : "Cette commande est close."}
        </p>
      ) : paid ? (
        <p className="m-0 text-[12.5px] leading-[1.6] text-muted-ink">
          Commande encaissée : l&apos;annuler exige de rembourser le client. Le
          remboursement depuis cet écran arrive avec le branchement Stripe
          (HEP-60) — d&apos;ici là, rien n&apos;est annulé sans que l&apos;argent
          soit rendu.
        </p>
      ) : (
        <div className="grid gap-3">
          <label className={label} htmlFor="cancel-reason">
            Motif d&apos;annulation (obligatoire)
          </label>
          <input
            id="cancel-reason"
            className={field}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Client injoignable, doublon…"
          />
          <button
            type="button"
            className={secondary}
            disabled={pending || reason.trim().length < 3}
            onClick={() => {
              if (!window.confirm("Annuler définitivement cette commande ?")) return;
              run(() => cancelOrderFromAdmin({ orderId, reason }), "Commande annulée.");
            }}
          >
            {pending ? "Annulation…" : "Annuler la commande"}
          </button>
        </div>
      )}

      <button type="button" className={`${secondary} mt-4`} disabled title="Arrive avec HEP-60">
        Rembourser — bientôt
      </button>
      <Feedback value={feedback} />
    </section>
  );
}

export function PrintButton() {
  return (
    <button type="button" className={`${primary} print:hidden`} onClick={() => window.print()}>
      Imprimer
    </button>
  );
}
