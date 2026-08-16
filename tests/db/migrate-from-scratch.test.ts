import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { runMigrations } from "@/infra/db/migrate";
import { testDbConfig } from "../helpers/test-db-config";

describe("migrate from scratch", () => {
  const pool = createPool(testDbConfig());
  const migrationsDir = path.resolve(process.cwd(), "db/migrations");

  beforeAll(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("applies every migration to an empty database without error", async () => {
    await expect(runMigrations(pool, migrationsDir)).resolves.toBeUndefined();

    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tableNames = tables.rows.map((row) => row.table_name);
    expect(tableNames).toContain("users");
    expect(tableNames).toContain("ledger_transactions");
    expect(tableNames).toContain("wallets");
  });

  it("re-running migrations against an already-migrated database is a no-op", async () => {
    await expect(runMigrations(pool, migrationsDir)).resolves.toBeUndefined();

    const applied = await pool.query(`SELECT COUNT(*)::int AS count FROM schema_migrations`);
    expect(applied.rows[0].count).toBeGreaterThan(0);
  });
});
