import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { assertMoneyModeMatches } from "@/infra/db/money-mode";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("assertMoneyModeMatches", () => {
  const pool = createPool(testDbConfig());

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("resolves when the process MONEY_MODE matches the DB singleton (both SIMULATED)", async () => {
    await expect(
      assertMoneyModeMatches(pool, { MONEY_MODE: "SIMULATED" }),
    ).resolves.toBeUndefined();
  });

  it("throws MONEY_MODE_FORBIDDEN when the process MONEY_MODE disagrees with the DB singleton", async () => {
    await expect(assertMoneyModeMatches(pool, { MONEY_MODE: "REAL" })).rejects.toMatchObject({
      code: "MONEY_MODE_FORBIDDEN",
    });
  });
});
