import type { DbConfig } from "@/infra/db/client";

/**
 * DATABASE_URL must be provided by the environment (CI's `database`/`integration`/
 * `invariants` jobs set it; locally export it before running `pnpm test:db` etc.) —
 * tests never hardcode a connection string, per RULE-E08.
 */
export function testDbConfig(): DbConfig {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to run DB-backed tests");
  }
  return {
    DATABASE_URL,
    DATABASE_POOL_MAX: Number(process.env.DATABASE_POOL_MAX ?? 5),
    DATABASE_STATEMENT_TIMEOUT_MS: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 5000),
    DATABASE_LOCK_TIMEOUT_MS: Number(process.env.DATABASE_LOCK_TIMEOUT_MS ?? 3000),
  };
}
