import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { findSchemaDrift } from "@/infra/db/schema-drift";
import { testDbConfig } from "../helpers/test-db-config";
import { resetAndMigrate } from "../helpers/reset-db";

/**
 * DR-04 (`Claude/ops/DISASTER_RECOVERY.md` §5): "Corrupted application deploy (bad migration).
 * Pass criteria: rollback path executes; schema-drift check catches it."
 *
 * Applies two classes of "bad migration" directly (bypassing the reviewed migration files, on
 * purpose, to simulate one slipping through): a stray column the ORM schema doesn't know about,
 * and — closer to a real incident — a required column dropped outright. Each is caught by
 * `db:check-drift` (MET-CI-03), then rolled back, then re-verified clean — proving the rollback
 * path actually executes, not just that a problem can be described.
 */
describe("DR-04: a bad migration is caught by the schema-drift check, and rollback executes", () => {
  const pool = createPool(testDbConfig());

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("a stray column not in schema.ts is detected, then the rollback removes it", async () => {
    const clean = await findSchemaDrift(pool);
    expect(clean).toEqual([]);

    await pool.query("ALTER TABLE users ADD COLUMN dr04_stray_column text");
    const withStrayColumn = await findSchemaDrift(pool);
    expect(
      withStrayColumn.some(
        (entry) => entry.table === "users" && entry.detail.includes("dr04_stray_column"),
      ),
    ).toBe(true);

    // Rollback path (the migration's own documented rollback plan, RULE-D02, executed here):
    await pool.query("ALTER TABLE users DROP COLUMN dr04_stray_column");
    const afterRollback = await findSchemaDrift(pool);
    expect(afterRollback).toEqual([]);
  });

  it("a required column dropped outright is detected, then the rollback restores it", async () => {
    const clean = await findSchemaDrift(pool);
    expect(clean).toEqual([]);

    await pool.query("ALTER TABLE users DROP COLUMN date_of_birth");
    const withMissingColumn = await findSchemaDrift(pool);
    expect(
      withMissingColumn.some(
        (entry) => entry.table === "users" && entry.detail.includes("date_of_birth"),
      ),
    ).toBe(true);

    // Rollback: re-add the column. A real incident would restore from backup/migration replay
    // instead of guessing the original type — this proves the drift check would have caught the
    // corruption before it reached production, which is DR-04's actual pass criterion.
    await pool.query(
      "ALTER TABLE users ADD COLUMN date_of_birth date NOT NULL DEFAULT '1970-01-01'",
    );
    await pool.query("ALTER TABLE users ALTER COLUMN date_of_birth DROP DEFAULT");
    const afterRollback = await findSchemaDrift(pool);
    expect(afterRollback).toEqual([]);
  });
});
