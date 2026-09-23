export interface AuditEventRecord {
  readonly id: string;
  readonly actorType: string;
  readonly actorId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly ipHash: string | null;
  readonly userAgent: string | null;
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
  readonly requestId: string | null;
  readonly createdAt: Date;
}

export interface AuditEventFilter {
  readonly actorId?: string;
  readonly action?: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly from?: Date;
  readonly to?: Date;
}

/**
 * Read-only search over the append-only `audit_events` table (T-907, `/admin/audit`,
 * `Routes.md` §3). DB-level filtering + pagination (unlike the in-memory `paginate()` used by
 * catalog/admin lists) because this table grows unbounded and is never small.
 */
export interface AuditEventRepository {
  search(
    filter: AuditEventFilter,
    page: { readonly limit: number; readonly offset: number },
  ): Promise<{ readonly items: readonly AuditEventRecord[]; readonly total: number }>;
}
