import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Config } from "@/platform/config";
import * as schema from "./schema";

export type DbConfig = Pick<
  Config,
  | "DATABASE_URL"
  | "DATABASE_POOL_MAX"
  | "DATABASE_STATEMENT_TIMEOUT_MS"
  | "DATABASE_LOCK_TIMEOUT_MS"
>;

export type Database = NodePgDatabase<typeof schema>;

/**
 * Applies DATABASE_STATEMENT_TIMEOUT_MS/DATABASE_LOCK_TIMEOUT_MS (already validated by
 * src/platform/config/schema.ts) as Postgres startup parameters, so every connection the
 * pool opens carries them — not just ones that happen to run a follow-up SET query.
 */
export function createPool(config: DbConfig): Pool {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    statement_timeout: config.DATABASE_STATEMENT_TIMEOUT_MS,
    lock_timeout: config.DATABASE_LOCK_TIMEOUT_MS,
  });
}

export function createDb(pool: Pool): Database {
  return drizzle(pool, { schema });
}
