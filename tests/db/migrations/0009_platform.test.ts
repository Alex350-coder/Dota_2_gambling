import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";

describe("0009_platform migration", () => {
  const pool = createPool(testDbConfig());

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("seeds exactly one SIMULATED money_mode row", async () => {
    const result = await pool.query("SELECT mode FROM money_mode");
    expect(result.rows).toEqual([{ mode: "SIMULATED" }]);
  });

  it("rejects a second money_mode row (singleton_id PK)", async () => {
    await expect(
      pool.query("INSERT INTO money_mode (singleton_id, mode) VALUES (true, 'REAL')"),
    ).rejects.toThrow();
  });

  it("rejects UPDATE and DELETE on audit_events (append-only)", async () => {
    const insertResult = await pool.query(
      `INSERT INTO audit_events (actor_type, action, entity_type, entity_id)
       VALUES ('SYSTEM', 'CREATE', 'market', gen_random_uuid()) RETURNING id`,
    );
    const id = insertResult.rows[0].id as string;

    await expect(
      pool.query("UPDATE audit_events SET action = 'UPDATE' WHERE id = $1", [id]),
    ).rejects.toThrow(/append-only/);

    await expect(pool.query("DELETE FROM audit_events WHERE id = $1", [id])).rejects.toThrow(
      /append-only/,
    );
  });
});
