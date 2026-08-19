export interface AuditEventInput {
  readonly actorType: "user" | "system" | "admin";
  readonly actorId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly ipHash?: string | null;
  readonly userAgent?: string | null;
  readonly requestId?: string | null;
}

/**
 * Thin port over the append-only `audit_events` table (T-314). Every identity
 * mutation records exactly one event through this interface so the audit
 * trail stays reachable via the domain layer without leaking drizzle/pg into
 * `src/application/**`.
 */
export interface AuditWriter<Tx> {
  record(tx: Tx, input: AuditEventInput): Promise<void>;
}
