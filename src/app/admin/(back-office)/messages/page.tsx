import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/server/db";
import {
  getMessage,
  INBOX_PAGE_SIZE,
  listMessages,
  MESSAGE_STATUS_LABELS,
} from "@/server/services/messages";
import { MarkAsRead, MessageActions } from "@/components/admin/message-actions";
import {
  MESSAGE_STATUS_SLUGS,
  messageSearchSchema,
  type MessageStatusSlug,
} from "@/lib/validation/admin-message";
import { adminRoutes } from "@/lib/routes";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PAGE = "/admin/messages";

/**
 * Boîte de réception du formulaire de contact (HEP-89).
 *
 * La base fait foi : un message dont la notification par mail s'est perdue
 * est ici quand même.
 */
export default function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div>
      <h1 className="m-0 mb-2 font-serif text-[1.8rem] font-normal">Messages</h1>
      <p className="m-0 mb-8 max-w-[70ch] text-[12.5px] leading-[1.6] text-muted-ink">
        Chaque message du formulaire de contact arrive ici <strong>et</strong> par mail. Pour répondre,
        réponds simplement au mail de notification : il part chez le client. Un message ne se
        supprime pas ; le spam s&apos;écarte.
      </p>
      <Suspense fallback={<p className="text-[13px] text-muted-ink">Chargement…</p>}>
        <MessagesContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function href(params: { etat?: string; q?: string; page?: number; id?: string }): string {
  const p = new URLSearchParams();
  if (params.etat) p.set("etat", params.etat);
  if (params.q) p.set("q", params.q);
  if (params.page && params.page > 1) p.set("page", String(params.page));
  if (params.id) p.set("id", params.id);
  const s = p.toString();
  return s ? `${PAGE}?${s}` : PAGE;
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

async function MessagesContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const raw = await searchParams;
  const search = messageSearchSchema.parse({
    etat: typeof raw.etat === "string" ? raw.etat : undefined,
    q: typeof raw.q === "string" ? raw.q : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
    id: typeof raw.id === "string" ? raw.id : undefined,
  });

  const status = search.etat ? MESSAGE_STATUS_SLUGS[search.etat] : null;
  const [{ items, total, page, byStatus }, open] = await Promise.all([
    listMessages(db, { status, q: search.q, page: search.page }),
    search.id ? getMessage(db, search.id) : Promise.resolve(null),
  ]);
  const pages = Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE));
  const keep = { etat: search.etat, q: search.q };

  return (
    <>
      <nav aria-label="Filtrer par état" className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
        <Link
          href={href({ q: search.q })}
          aria-current={!search.etat ? "page" : undefined}
          className={!search.etat ? "font-semibold" : "text-muted-ink underline underline-offset-4"}
        >
          Tous (hors spam)
        </Link>
        {(Object.entries(MESSAGE_STATUS_SLUGS) as [MessageStatusSlug, keyof typeof MESSAGE_STATUS_LABELS][]).map(
          ([slug, s]) => (
            <Link
              key={slug}
              href={href({ etat: slug, q: search.q })}
              aria-current={search.etat === slug ? "page" : undefined}
              className={search.etat === slug ? "font-semibold" : "text-muted-ink underline underline-offset-4"}
            >
              {MESSAGE_STATUS_LABELS[s]} ({byStatus[s] ?? 0})
            </Link>
          ),
        )}
      </nav>

      <form action={PAGE} className="mb-6 flex max-w-[480px] gap-2" role="search">
        {search.etat && <input type="hidden" name="etat" value={search.etat} />}
        <label htmlFor="q" className="sr-only">
          Rechercher
        </label>
        <input
          id="q"
          name="q"
          defaultValue={search.q}
          placeholder="Nom, email, sujet, texte…"
          className="min-w-0 flex-1 border border-line-strong bg-transparent px-3 py-2 text-[14px] outline-none focus:border-ink"
        />
        <button
          type="submit"
          className="cursor-pointer border border-ink bg-ink px-4 text-[11px] font-semibold uppercase tracking-[.14em] text-white"
        >
          Chercher
        </button>
      </form>

      {search.id && !open && (
        <p role="alert" className="m-0 mb-6 text-[13px] text-red-700">
          Ce message est introuvable.
        </p>
      )}

      {open && (
        <article className="mb-10 border border-line-strong p-6" aria-labelledby="message-subject">
          {open.status === "NEW" && <MarkAsRead id={open.id} />}
          <div className="mb-1 text-[11px] uppercase tracking-[.12em] text-muted-ink">
            {MESSAGE_STATUS_LABELS[open.status]} · {dateFmt.format(open.createdAt)}
          </div>
          <h2 id="message-subject" className="m-0 mb-2 font-serif text-[1.3rem] font-normal">
            {open.subject}
          </h2>
          <p className="m-0 mb-4 text-[13px]">
            {open.firstName} {open.lastName} ·{" "}
            <a
              href={`mailto:${open.email}?subject=${encodeURIComponent(`Re: ${open.subject}`)}`}
              className="underline underline-offset-4"
            >
              {open.email}
            </a>
          </p>
          <p className="m-0 mb-6 whitespace-pre-wrap text-[14px] leading-[1.7]">{open.body}</p>
          <MessageActions id={open.id} status={open.status} />
          <Link href={href(keep)} className="mt-4 inline-block text-[12px] text-muted-ink underline underline-offset-4">
            Fermer
          </Link>
        </article>
      )}

      {items.length === 0 ? (
        <p className="text-[13px] text-muted-ink">Aucun message.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.12em] text-muted-ink">
                <th className="py-2 pr-4 font-medium">Reçu</th>
                <th className="py-2 pr-4 font-medium">De</th>
                <th className="py-2 pr-4 font-medium">Sujet</th>
                <th className="py-2 font-medium">État</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr
                  key={m.id}
                  className={`border-b border-line-soft align-top ${m.status === "NEW" ? "font-semibold" : ""}`}
                >
                  <td className="whitespace-nowrap py-2 pr-4 tabular-nums">{dateFmt.format(m.createdAt)}</td>
                  <td className="py-2 pr-4">
                    {m.firstName} {m.lastName}
                    <div className="text-[12px] font-normal text-muted-ink">{m.email}</div>
                  </td>
                  <td className="py-2 pr-4">
                    <Link href={href({ ...keep, page, id: m.id })} className="underline underline-offset-4">
                      {m.subject}
                    </Link>
                  </td>
                  <td className="py-2">{MESSAGE_STATUS_LABELS[m.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-6 flex gap-4 text-[13px]">
          {page > 1 && (
            <Link href={href({ ...keep, page: page - 1 })} className="underline underline-offset-4">
              Plus récents
            </Link>
          )}
          <span className="text-muted-ink">
            Page {page} / {pages}
          </span>
          {page < pages && (
            <Link href={href({ ...keep, page: page + 1 })} className="underline underline-offset-4">
              Plus anciens
            </Link>
          )}
        </nav>
      )}

      <p className="mt-6 text-[11.5px] text-muted-ink">
        Chaque changement d&apos;état est inscrit au{" "}
        <Link href={`${adminRoutes.auditLog}?entite=Message`} className="underline underline-offset-4">
          journal
        </Link>
        .
      </p>
    </>
  );
}
