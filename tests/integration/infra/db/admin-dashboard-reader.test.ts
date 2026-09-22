import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleAdminDashboardReader } from "@/infra/db/admin-dashboard-reader";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

/**
 * Proves the aggregate SQL (modeled on reconcile-queries.ts INV-06/INV-07/INV-13's shape) is
 * valid against the real schema and reports the correct zero-state. A fully matched escrow
 * fixture would need the whole catalog+betting+matching pipeline (see
 * tests/integration/settlement/mandatory-scenarios.test.ts) and is exercised there and in the
 * settlement suites already — this test's job is the aggregate read path itself, not
 * re-proving matching/settlement correctness.
 */
describe("DrizzleAdminDashboardReader", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("reports an all-zero summary on an empty database", async () => {
    const summary = await uow.run(async (tx: DbTx) =>
      new DrizzleAdminDashboardReader(tx).getSummary(),
    );

    expect(summary).toEqual({
      openMarketCount: 0,
      totalEscrowMinor: 0n,
      pendingSettlementRunCount: 0,
      failedSettlementRunCount: 0,
    });
  });
});
