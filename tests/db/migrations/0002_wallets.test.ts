import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";

describe("0002_wallets migration", () => {
  const pool = createPool(testDbConfig());
  let userId: string;

  beforeAll(async () => {
    await resetAndMigrate(pool);
    const result = await pool.query(
      `INSERT INTO users (email, date_of_birth) VALUES ($1, $2) RETURNING id`,
      ["wallet-owner@example.test", "1990-01-01"],
    );
    userId = result.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("accepts a wallet with nonnegative balances", async () => {
    const result = await pool.query(
      `INSERT INTO wallets (user_id, currency, available_minor, locked_minor) VALUES ($1, $2, $3, $4) RETURNING user_id`,
      [userId, "PEN", 1000, 0],
    );
    expect(result.rows).toHaveLength(1);
  });

  it("rejects a negative available_minor (chk_wallets_available_nonneg)", async () => {
    await expect(
      pool.query(`INSERT INTO wallets (user_id, currency, available_minor) VALUES ($1, $2, $3)`, [
        userId,
        "USD",
        -1,
      ]),
    ).rejects.toThrow(/chk_wallets_available_nonneg/);
  });

  it("rejects a negative locked_minor (chk_wallets_locked_nonneg)", async () => {
    await expect(
      pool.query(`INSERT INTO wallets (user_id, currency, locked_minor) VALUES ($1, $2, $3)`, [
        userId,
        "EUR",
        -1,
      ]),
    ).rejects.toThrow(/chk_wallets_locked_nonneg/);
  });
});
