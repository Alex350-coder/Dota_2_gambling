import path from "node:path";
import { createPool } from "@/infra/db/client";
import { runMigrations } from "@/infra/db/migrate";
import { loadConfig } from "@/platform/config";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config);
  const migrationsDir = path.resolve(process.cwd(), "db/migrations");

  try {
    await runMigrations(pool, migrationsDir);
    console.log("db:migrate: all migrations applied");
  } finally {
    await pool.end();
  }
}

void main();
