import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { runSeed } from "../../db/seed/dev";
import { testDbConfig } from "../helpers/test-db-config";
import { resetAndMigrate } from "../helpers/reset-db";

describe("db/seed/dev", () => {
  const pool = createPool(testDbConfig());

  beforeEach(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("refuses to run when MONEY_MODE=REAL", async () => {
    await expect(runSeed(pool, "REAL")).rejects.toThrow(/MONEY_MODE=REAL/);

    const games = await pool.query(`SELECT 1 FROM games`);
    expect(games.rowCount).toBe(0);
  });

  it("seeds a book reproducing Testing.md FIN-02 (matched=3000, unmatched=7000, escrow=6000)", async () => {
    await runSeed(pool, "SIMULATED");

    const games = await pool.query(`SELECT id FROM games WHERE slug = 'dota-2-seed'`);
    expect(games.rowCount).toBe(1);

    const markets = await pool.query(`SELECT COUNT(*)::int AS count FROM markets`);
    expect(markets.rows[0].count).toBe(3);

    const users = await pool.query(`SELECT COUNT(*)::int AS count FROM users`);
    expect(users.rows[0].count).toBe(8); // 6 bettors + 2 streamers

    const orderA = await pool.query(
      `SELECT matched_minor, unmatched_minor FROM bet_orders WHERE idempotency_key = 'seed-order-a'`,
    );
    expect(orderA.rows[0].matched_minor).toBe("3000");
    expect(orderA.rows[0].unmatched_minor).toBe("7000");

    const escrow = await pool.query<{ balance: string }>(
      `SELECT SUM(signed_amount_minor)::text AS balance FROM ledger_entries WHERE account_key LIKE 'MARKET_ESCROW:%'`,
    );
    expect(escrow.rows[0]?.balance).toBe("6000");
  });

  it("is idempotent: re-running after a prior seed is a no-op", async () => {
    await runSeed(pool, "SIMULATED");
    const firstCount = await pool.query(`SELECT COUNT(*)::int AS count FROM bet_orders`);

    await runSeed(pool, "SIMULATED");
    const secondCount = await pool.query(`SELECT COUNT(*)::int AS count FROM bet_orders`);

    expect(secondCount.rows[0].count).toBe(firstCount.rows[0].count);
  });
});
