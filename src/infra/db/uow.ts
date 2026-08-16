import type { UnitOfWork, UnitOfWorkOptions } from "@/domain/ports";
import type { Database } from "./client";

/** The transaction handle drizzle-orm passes into `Database.transaction()`'s callback. */
export type DbTx = Parameters<Database["transaction"]>[0] extends (tx: infer Tx) => Promise<unknown>
  ? Tx
  : never;

const ISOLATION_LEVEL_MAP: Record<
  NonNullable<UnitOfWorkOptions["isolation"]>,
  "read committed" | "repeatable read" | "serializable"
> = {
  "READ COMMITTED": "read committed",
  "REPEATABLE READ": "repeatable read",
  SERIALIZABLE: "serializable",
};

/** Postgres SQLSTATE for deadlock_detected and serialization_failure (MATCHING_ENGINE.md §7). */
const RETRYABLE_SQLSTATES = new Set(["40P01", "40001"]);

function isRetryable(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  const { code } = error;
  return typeof code === "string" && RETRYABLE_SQLSTATES.has(code);
}

function jitteredBackoffMs(attempt: number): number {
  const base = [25, 50, 100][attempt] ?? 100;
  return base + Math.random() * base * 0.25;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `Database.transaction()` (drizzle-orm/node-postgres) is the concrete `Tx` binding for the
 * domain's `UnitOfWork` port. Retries the whole callback on deadlock/serialization failure
 * (MATCHING_ENGINE.md §7); any other error propagates immediately without retry.
 */
export class DrizzleUnitOfWork implements UnitOfWork<DbTx> {
  constructor(private readonly db: Database) {}

  async run<T>(work: (tx: DbTx) => Promise<T>, opts?: UnitOfWorkOptions): Promise<T> {
    const attempts = opts?.retry?.attempts ?? 1;
    const isolationLevel = opts?.isolation ? ISOLATION_LEVEL_MAP[opts.isolation] : undefined;

    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await this.db.transaction(work, isolationLevel ? { isolationLevel } : undefined);
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === attempts - 1) {
          throw error;
        }
        await sleep(jitteredBackoffMs(attempt));
      }
    }

    throw lastError;
  }
}
