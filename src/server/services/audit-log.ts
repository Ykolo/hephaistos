import { z } from "zod";
import type { Tx } from "../db";

/** Consultation du journal d'activité (HEP-78). Lecture seule. */

export const AUDIT_PAGE_SIZE = 50;

export const auditSearchSchema = z.object({
  acteur: z.string().trim().min(1).max(100).optional().catch(undefined),
  entite: z.string().trim().min(1).max(50).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

export type AuditSearch = z.infer<typeof auditSearchSchema>;

export async function searchAuditLog(db: Tx, search: AuditSearch) {
  const where = {
    ...(search.acteur ? { actorId: search.acteur } : {}),
    ...(search.entite ? { entity: search.entite } : {}),
  };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (search.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
    db.auditLog.count({ where }),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) };
}

/** Valeurs proposées dans les filtres : celles qui existent vraiment. */
export async function auditFilterOptions(db: Tx) {
  const [actors, entities] = await Promise.all([
    db.auditLog.groupBy({ by: ["actorId"], _count: true }),
    db.auditLog.groupBy({ by: ["entity"], _count: true }),
  ]);
  return {
    actorIds: actors.map((a) => a.actorId).filter((id): id is string => !!id),
    entities: entities.map((e) => e.entity).sort(),
  };
}
