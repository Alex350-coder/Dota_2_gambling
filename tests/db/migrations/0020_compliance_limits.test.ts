import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";

describe("0020_compliance_limits migration", () => {
  const pool = createPool(testDbConfig());
  let userId: string;

  beforeAll(async () => {
    await resetAndMigrate(pool);
    const result = await pool.query(
      `INSERT INTO users (email, date_of_birth) VALUES ($1, $2) RETURNING id`,
      ["rg-limits-owner@example.test", "1990-01-01"],
    );
    userId = result.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("accepts a limit with only a current value", async () => {
    const result = await pool.query(
      `INSERT INTO rg_limits (user_id, kind, period, current_value) VALUES ($1, 'STAKE', 'DAY', 10000) RETURNING id`,
      [userId],
    );
    expect(result.rows).toHaveLength(1);
  });

  it("accepts a limit with a pending raise pair", async () => {
    const result = await pool.query(
      `INSERT INTO rg_limits (user_id, kind, period, current_value, pending_value, effective_at)
       VALUES ($1, 'DEPOSIT', 'DAY', 10000, 20000, now() + interval '24 hours') RETURNING id`,
      [userId],
    );
    expect(result.rows).toHaveLength(1);
  });

  it("rejects a negative current_value (chk_rg_limits_current_non_negative)", async () => {
    await expect(
      pool.query(
        `INSERT INTO rg_limits (user_id, kind, period, current_value) VALUES ($1, 'LOSS', 'DAY', -1)`,
        [userId],
      ),
    ).rejects.toThrow(/chk_rg_limits_current_non_negative/);
  });

  it("rejects a pending_value without an effective_at (chk_rg_limits_pending_pair)", async () => {
    await expect(
      pool.query(
        `INSERT INTO rg_limits (user_id, kind, period, current_value, pending_value) VALUES ($1, 'SINGLE_BET', 'PER_BET', 5000, 8000)`,
        [userId],
      ),
    ).rejects.toThrow(/chk_rg_limits_pending_pair/);
  });

  it("rejects a duplicate (user_id, kind, period) (uq_rg_limits_user_kind_period)", async () => {
    await pool.query(
      `INSERT INTO rg_limits (user_id, kind, period, current_value) VALUES ($1, 'SESSION_TIME', 'SESSION', 180)`,
      [userId],
    );
    await expect(
      pool.query(
        `INSERT INTO rg_limits (user_id, kind, period, current_value) VALUES ($1, 'SESSION_TIME', 'SESSION', 90)`,
        [userId],
      ),
    ).rejects.toThrow(/uq_rg_limits_user_kind_period/);
  });

  it("accepts a self-exclusion row", async () => {
    const result = await pool.query(
      `INSERT INTO self_exclusions (user_id, period, revocable_at) VALUES ($1, '30D', now() + interval '30 days') RETURNING id`,
      [userId],
    );
    expect(result.rows).toHaveLength(1);
  });

  it("rejects UPDATE and DELETE on self_exclusions (append-only)", async () => {
    const insertResult = await pool.query(
      `INSERT INTO self_exclusions (user_id, period) VALUES ($1, '24H') RETURNING id`,
      [userId],
    );
    const id = insertResult.rows[0].id as string;

    await expect(
      pool.query(`UPDATE self_exclusions SET period = '7D' WHERE id = $1`, [id]),
    ).rejects.toThrow(/append-only/);

    await expect(pool.query(`DELETE FROM self_exclusions WHERE id = $1`, [id])).rejects.toThrow(
      /append-only/,
    );
  });

  it("adds users.revocable_at, nullable and defaulting to null", async () => {
    const result = await pool.query(`SELECT revocable_at FROM users WHERE id = $1`, [userId]);
    expect(result.rows).toEqual([{ revocable_at: null }]);
  });
});
