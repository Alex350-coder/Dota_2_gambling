import { createPool } from "@/infra/db/client";
import { findSchemaDrift } from "@/infra/db/schema-drift";
import { loadConfig } from "@/platform/config";

/**
 * Assumes the target database has already been migrated (CI's `database` job runs
 * `db:migrate` immediately before this). Detects the committed `src/infra/db/schema/**`
 * disagreeing with what `db/migrations/**` actually produced (MET-CI-03).
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config);

  try {
    const drift = await findSchemaDrift(pool);

    if (drift.length > 0) {
      for (const entry of drift) {
        console.error(`DRIFT: ${entry.table} — ${entry.detail}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log("db:check-drift: schema.ts matches the migrated database (MET-CI-03 = 0)");
  } finally {
    await pool.end();
  }
}

void main();
