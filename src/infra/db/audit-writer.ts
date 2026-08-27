import type { AuditEventInput, AuditWriter } from "@/domain/ports";
import { auditEvents } from "./schema/platform";
import type { DbTx } from "./uow";

export class DrizzleAuditWriter implements AuditWriter<DbTx> {
  async record(tx: DbTx, input: AuditEventInput): Promise<void> {
    await tx.insert(auditEvents).values({
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ipHash: input.ipHash ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId ?? null,
      after: input.after ?? null,
    });
  }
}
