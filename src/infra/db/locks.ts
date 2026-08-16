import { sql } from "drizzle-orm";
import type { DbTx } from "./uow";

/**
 * Acquires `pg_advisory_xact_lock(hashtext(key))` — the lock ladder's first rung
 * (MATCHING_ENGINE.md §5). Released automatically at COMMIT/ROLLBACK (the `_xact_`
 * variant), so a crash mid-transaction can never leak it.
 */
export async function pgAdvisoryXactLock(tx: DbTx, key: string): Promise<void> {
  // drizzle's sql`` tag parameterizes interpolated values (not string concatenation); the
  // rule can't distinguish that from real concatenation.
  // eslint-disable-next-line project/no-raw-sql-concat
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
}
