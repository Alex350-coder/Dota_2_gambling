export interface RecordLoginAttemptInput {
  readonly emailHash: string;
  readonly ipHash: string | null;
  readonly succeeded: boolean;
}

/**
 * Append-only (login_attempts grants SELECT/INSERT only, Claude/Rules.md RULE-A02
 * financial/append-only pattern reused here for the security audit trail). Keyed by
 * hashes, never raw email/IP, so the lockout window can be queried without storing
 * PII in this table (Security.md §5, Routes.md §4 rate-limit key convention).
 */
export interface LoginAttemptRepository {
  record(input: RecordLoginAttemptInput): Promise<void>;
  countRecentFailures(emailHash: string, ipHash: string | null, since: Date): Promise<number>;
}
