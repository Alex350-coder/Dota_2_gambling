import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";

/**
 * Applies db/migrations/NNNN_name.sql files in filename order, each inside its own
 * transaction, tracking applied files in schema_migrations so re-running is a no-op
 * (RULE-D01/D02: forward-only, idempotent from-scratch or from any partial state).
 */
export async function runMigrations(pool: Pool, migrationsDir: string): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();

  for (const file of files) {
    const alreadyApplied = await pool.query("SELECT 1 FROM schema_migrations WHERE id = $1", [
      file,
    ]);
    if (alreadyApplied.rowCount && alreadyApplied.rowCount > 0) {
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`migration ${file} failed: ${detail}`);
    } finally {
      client.release();
    }
  }
}
