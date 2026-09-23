import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import type { AuditEventFilter, AuditEventRecord, AuditEventRepository } from "@/domain/ports";
import { auditEvents } from "../schema/platform";
import type { DbTx } from "../uow";

export class DrizzleAuditEventRepository implements AuditEventRepository {
  constructor(private readonly tx: DbTx) {}

  async search(
    filter: AuditEventFilter,
    page: { readonly limit: number; readonly offset: number },
  ): Promise<{ items: readonly AuditEventRecord[]; total: number }> {
    const conditions = [];
    if (filter.actorId) conditions.push(eq(auditEvents.actorId, filter.actorId));
    if (filter.action) conditions.push(eq(auditEvents.action, filter.action));
    if (filter.entityType) conditions.push(eq(auditEvents.entityType, filter.entityType));
    if (filter.entityId) conditions.push(eq(auditEvents.entityId, filter.entityId));
    if (filter.from) conditions.push(gte(auditEvents.createdAt, filter.from));
    if (filter.to) conditions.push(lte(auditEvents.createdAt, filter.to));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRow] = await Promise.all([
      this.tx
        .select()
        .from(auditEvents)
        .where(where)
        .orderBy(desc(auditEvents.createdAt))
        .limit(page.limit)
        .offset(page.offset),
      this.tx.select({ value: count() }).from(auditEvents).where(where),
    ]);

    return { items: rows.map(toRecord), total: totalRow[0]?.value ?? 0 };
  }
}

function toRecord(row: typeof auditEvents.$inferSelect): AuditEventRecord {
  return {
    id: row.id,
    actorType: row.actorType,
    actorId: row.actorId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    ipHash: row.ipHash,
    userAgent: row.userAgent,
    before: row.before as Record<string, unknown> | null,
    after: row.after as Record<string, unknown> | null,
    requestId: row.requestId,
    createdAt: row.createdAt,
  };
}
