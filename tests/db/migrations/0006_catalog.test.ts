import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";

describe("0006_catalog migration", () => {
  const pool = createPool(testDbConfig());

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("accepts the MVP economic profile (18/10 odds, 2000bps commission, 0bps fee)", async () => {
    const result = await pool.query(
      `INSERT INTO economic_profiles
         (odds_num, odds_den, streamer_commission_bps, platform_fee_bps, currency, min_stake_minor, max_stake_minor)
       VALUES (18, 10, 2000, 0, 'PEN', 100, 10000000) RETURNING id`,
    );
    expect(result.rows).toHaveLength(1);
  });

  it("rejects a profile whose odds exceed what commission/fee can fund (chk_ep_self_funding)", async () => {
    await expect(
      pool.query(
        `INSERT INTO economic_profiles
           (odds_num, odds_den, streamer_commission_bps, platform_fee_bps, currency, min_stake_minor, max_stake_minor)
         VALUES (19, 10, 2000, 0, 'PEN', 100, 10000000)`,
      ),
    ).rejects.toThrow(/chk_ep_self_funding/);
  });
});
