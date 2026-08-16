import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { findSchemaDrift } from "@/infra/db/schema-drift";
import { testDbConfig } from "../helpers/test-db-config";
import { resetAndMigrate } from "../helpers/reset-db";

describe("schema drift", () => {
  const pool = createPool(testDbConfig());

  beforeEach(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("reports no drift against a freshly migrated database", async () => {
    const drift = await findSchemaDrift(pool);
    expect(drift).toEqual([]);
  });

  it("detects a column removed from the database that the schema still expects", async () => {
    await pool.query(`ALTER TABLE wallets DROP COLUMN version`);

    const drift = await findSchemaDrift(pool);
    const walletDrift = drift.find((entry) => entry.table === "wallets");
    expect(walletDrift?.detail).toContain('column "version" missing');
  });

  it("detects a column present in the database but absent from the schema", async () => {
    await pool.query(`ALTER TABLE wallets ADD COLUMN legacy_note text`);

    const drift = await findSchemaDrift(pool);
    const walletDrift = drift.find((entry) => entry.table === "wallets");
    expect(walletDrift?.detail).toContain(
      'column "legacy_note" present in database but not in schema',
    );
  });

  it("detects a nullability mismatch between schema and database", async () => {
    await pool.query(`ALTER TABLE wallets ALTER COLUMN version DROP NOT NULL`);

    const drift = await findSchemaDrift(pool);
    const walletDrift = drift.find((entry) => entry.table === "wallets");
    expect(walletDrift?.detail).toContain("nullability mismatch");
  });
});
