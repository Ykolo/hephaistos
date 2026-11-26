import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "./db";

/**
 * Journal d'activité de l'administration (HEP-78).
 *
 * Règle : **toute** écriture faite depuis l'admin laisse une ligne
 * `AuditLog` — qui, quoi, sur quelle entité, avec le diff. Les services du
 * catalogue, des lots et des commandes l'écrivent déjà dans leur propre
 * transaction ; ce helper sert aux écritures qui n'en avaient pas (images).
 */
export async function recordAdminWrite(
  db: Tx,
  entry: {
    actorId: string;
    entity: string;
    entityId: string;
    action: string;
    diff?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await db.auditLog.create({ data: entry });
}
