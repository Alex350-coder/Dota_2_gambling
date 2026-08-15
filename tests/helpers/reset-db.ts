import path from "node:path";
import type { Pool } from "pg";
import { runMigrations } from "@/infra/db/migrate";

const migrationsDir = path.resolve(process.cwd(), "db/migrations");

/**
 * Drops and recreates the public schema, then applies every committed migration —
 * the "migrate from scratch" state every db/integration/invariants test starts from.
 */
export async function resetAndMigrate(pool: Pool): Promise<void> {
  await pool.query("DROP SCHEMA public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await runMigrations(pool, migrationsDir);
}
