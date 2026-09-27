import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { runAllReconcileChecks } from "@/infra/db/reconcile-queries";
import { testDbConfig } from "../helpers/test-db-config";
import { resetAndMigrate } from "../helpers/reset-db";
import { buildLifecycle } from "./helpers/lifecycle";
import {
  adminUrl,
  createDrillDatabase,
  dropDrillDatabase,
  dumpDatabase,
  restoreDatabase,
  withDbName,
} from "./helpers/dump-restore";

/**
 * DR-03 (`Claude/ops/DISASTER_RECOVERY.md` §5): "Simulated total loss of the primary, restore
 * from base + WAL. Pass criteria: RTO/RPO met; reconciliation clean."
 *
 * This repository has no provisioned WAL-archiving/streaming-replica infrastructure (see
 * `scripts/restore.sh`'s documented limitation), so "restore from base + WAL" is approximated
 * here as a full logical dump/restore of a multi-market dataset — proving the mechanism (§4:
 * "why replay cannot double-pay") end-to-end rather than the formal RTO/RPO numbers, which need
 * real infra to measure honestly.
 */
describe("DR-03: simulated total loss, full restore, reconciliation clean", () => {
  const sourceConfig = testDbConfig();
  const pool = createPool(sourceConfig);
  const drillDbName = `dr03_${randomUUID().replace(/-/g, "")}`;
  const drillUrl = withDbName(sourceConfig.DATABASE_URL, drillDbName);

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
    await dropDrillDatabase(adminUrl(sourceConfig.DATABASE_URL), drillDbName).catch(
      () => undefined,
    );
  });

  it("a multi-market dataset restores clean and reconciles to zero", async () => {
    const lifecycle = buildLifecycle(pool);

    // Three markets in different lifecycle stages, so the restored dataset isn't a single
    // trivial row — an OPEN market with an unmatched order, a SETTLED market, and a second
    // SETTLED market, exercising several account_key shapes at once.
    const openMarket = await lifecycle.createMatchedMarket();
    const bettor = await lifecycle.createUser();
    await lifecycle.placeOrder.execute({
      userId: bettor,
      marketId: openMarket.marketId,
      outcomeId: openMarket.outcomeAId,
      requestedMinor: 2_000n,
      idempotencyKey: randomUUID(),
    });

    const settledMarketA = await lifecycle.createMatchedMarket();
    await lifecycle.closeAndConfirm(settledMarketA.marketId, settledMarketA.outcomeAId);
    await lifecycle.settleMarket.execute({
      actorId: await lifecycle.createUser(),
      marketId: settledMarketA.marketId,
    });

    const settledMarketB = await lifecycle.createMatchedMarket();
    await lifecycle.closeAndConfirm(settledMarketB.marketId, settledMarketB.outcomeBId);
    await lifecycle.settleMarket.execute({
      actorId: await lifecycle.createUser(),
      marketId: settledMarketB.marketId,
    });

    const preRestoreClient = await pool.connect();
    let preRestoreResults;
    try {
      preRestoreResults = await runAllReconcileChecks(preRestoreClient);
    } finally {
      preRestoreClient.release();
    }
    expect(preRestoreResults.filter((r) => r.status === "FAIL")).toEqual([]);

    const rtoStart = Date.now();
    const { dumpPath, cleanup } = await dumpDatabase(sourceConfig.DATABASE_URL);
    try {
      await createDrillDatabase(adminUrl(sourceConfig.DATABASE_URL), drillDbName);
      await restoreDatabase(dumpPath, drillUrl);
    } finally {
      await cleanup();
    }

    const drillPool = createPool({ ...sourceConfig, DATABASE_URL: drillUrl });
    try {
      const drillClient = await drillPool.connect();
      let results;
      try {
        results = await runAllReconcileChecks(drillClient);
      } finally {
        drillClient.release();
      }
      const rtoMs = Date.now() - rtoStart;
      expect(results).toHaveLength(preRestoreResults.length);
      expect(results.filter((r) => r.status === "FAIL")).toEqual([]);

      console.log(
        `[DR-03] local restore+verify wall-clock (directional RTO): ${rtoMs}ms. RPO: N/A for a ` +
          "logical-dump-only strategy — equals time-since-last-dump, not the <=5min MET-DR-01 " +
          "target, which requires the WAL-archiving infra documented as absent in scripts/restore.sh.",
      );
    } finally {
      await drillPool.end();
    }
  }, 60_000);
});
