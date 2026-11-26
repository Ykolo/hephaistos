import { Suspense } from "react";
import { connection } from "next/server";
import Form from "next/form";
import Link from "next/link";
import { db } from "@/server/db";
import { actorLabel, loadActorNames } from "@/server/services/actors";
import {
  auditFilterOptions,
  auditSearchSchema,
  searchAuditLog,
  type AuditSearch,
} from "@/server/services/audit-log";
import { adminRoutes } from "@/lib/routes";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  dateStyle: "short",
  timeStyle: "medium",
});

const field = "h-9 border border-line bg-paper px-2 text-[13px]";

/**
 * Journal d'activité (HEP-78) : qui a modifié quoi, et quand. Filtrable par
 * auteur et par type d'entité.
 */
export default function AuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div>
      <h1 className="m-0 mb-6 font-serif text-[26px] font-normal">Journal d&apos;activité</h1>
      <Suspense fallback={<p className="text-[13px] text-muted-ink">Chargement du journal…</p>}>
        <AuditLogContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function pageHref(search: AuditSearch, page: number): string {
  const params = new URLSearchParams();
  if (search.acteur) params.set("acteur", search.acteur);
  if (search.entite) params.set("entite", search.entite);
  params.set("page", String(page));
  return `${adminRoutes.auditLog}?${params}`;
}

async function AuditLogContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const search = auditSearchSchema.parse(await searchParams);
  const [{ rows, total, pages }, options] = await Promise.all([
    searchAuditLog(db, search),
    auditFilterOptions(db),
  ]);
  const names = await loadActorNames(db, [...options.actorIds, ...rows.map((r) => r.actorId)]);

  return (
    <>
      <Form action={adminRoutes.auditLog} className="mb-6 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-[12px] text-muted-ink">
          Auteur
          <select name="acteur" defaultValue={search.acteur ?? ""} className={field}>
            <option value="">Tous</option>
            {options.actorIds.map((id) => (
              <option key={id} value={id}>
                {actorLabel(id, names)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[12px] text-muted-ink">
          Entité
          <select name="entite" defaultValue={search.entite ?? ""} className={field}>
            <option value="">Toutes</option>
            {options.entities.map((entity) => (
              <option key={entity} value={entity}>
                {entity}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-9 bg-ink px-4 text-[13px] text-paper">
          Filtrer
        </button>
        {(search.acteur || search.entite) && (
          <Link href={adminRoutes.auditLog} className="text-[12px] underline underline-offset-4">
            Réinitialiser
          </Link>
        )}
      </Form>

      <p className="mb-3 text-[12px] text-muted-ink">
        {total} entrée{total > 1 ? "s" : ""}
        {pages > 1 && ` · page ${search.page} sur ${pages}`}
      </p>

      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-ink">Aucune entrée.</p>
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.12em] text-muted-ink">
              <th className="py-2 pr-3 font-normal">Date</th>
              <th className="py-2 pr-3 font-normal">Auteur</th>
              <th className="py-2 pr-3 font-normal">Entité</th>
              <th className="py-2 pr-3 font-normal">Action</th>
              <th className="py-2 font-normal">Détail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line-soft align-top">
                <td className="whitespace-nowrap py-2 pr-3">{dateTime.format(row.createdAt)}</td>
                <td className="py-2 pr-3">{actorLabel(row.actorId, names)}</td>
                <td className="py-2 pr-3">
                  {row.entity}
                  <div className="font-mono text-[11px] text-muted-ink">{row.entityId}</div>
                </td>
                <td className="py-2 pr-3">{row.action}</td>
                <td className="py-2">
                  {row.diff ? (
                    <pre className="m-0 max-w-[420px] overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-body">
                      {JSON.stringify(row.diff, null, 2)}
                    </pre>
                  ) : (
                    <span className="text-muted-ink">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pages > 1 && (
        <nav className="mt-5 flex gap-4 text-[13px]">
          {search.page > 1 && (
            <Link href={pageHref(search, search.page - 1)} className="underline underline-offset-4">
              ← Plus récentes
            </Link>
          )}
          {search.page < pages && (
            <Link href={pageHref(search, search.page + 1)} className="underline underline-offset-4">
              Plus anciennes →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
