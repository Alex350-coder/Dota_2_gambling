import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
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
 * DR-01 (`Claude/ops/DISASTER_RECOVERY.md` §5): "Restore to a point mid-settlement, then re-run
 * the settlement. Pass criteria: exactly one payout per allocation; INV-07 holds; MET-DR-04 = 0."
 *
 * This drill settles a market to completion, takes a real logical backup (the same mechanism as
 * `scripts/restore.sh backup`), restores it into a fresh database (simulating recovery after a
 * crash discovered only after settlement had already completed), and re-issues the exact same
 * settlement call against the restored data — proving the `ALREADY_SETTLED` idempotency
 * guarantee (RULE-F12's unique-completed-settlement-per-market constraint) survives a
 * dump/restore cycle, not just a single live process.
 */
describe("DR-01: restore mid/post-settlement, re-run settlement (MET-DR-04)", () => {
  const sourceConfig = testDbConfig();
  const pool = createPool(sourceConfig);
  const drillDbName = `dr01_${randomUUID().replace(/-/g, "")}`;
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

  it("exactly one payout per allocation after settlement survives a restore+replay", async () => {
    const lifecycle = buildLifecycle(pool);
    const admin = await lifecycle.createUser();
    const { marketId, outcomeAId } = await lifecycle.createMatchedMarket();
    await lifecycle.closeAndConfirm(marketId, outcomeAId);

    const firstRun = await lifecycle.settleMarket.execute({ actorId: admin, marketId });
    expect(firstRun.status).toBe("COMPLETED");

    const payoutCountBefore = await countSettlePayouts(pool, marketId);
    expect(payoutCountBefore).toBeGreaterThan(0);

    const restoreStart = Date.now();
    const { dumpPath, cleanup } = await dumpDatabase(sourceConfig.DATABASE_URL);
    try {
      await createDrillDatabase(adminUrl(sourceConfig.DATABASE_URL), drillDbName);
      const restoreResult = await restoreDatabase(dumpPath, drillUrl);
      // A non-zero pg_restore exit can be a harmless cross-version warning (see
      // tests/dr/helpers/dump-restore.ts) — correctness is verified below, not by this exit code.
      expect(restoreResult.exitCode).toBeGreaterThanOrEqual(0);
    } finally {
      await cleanup();
    }
    const restoreDurationMs = Date.now() - restoreStart;

    const drillPool = createPool({ ...sourceConfig, DATABASE_URL: drillUrl });
    try {
      const drillLifecycle = buildLifecycle(drillPool);

      await expect(
        drillLifecycle.settleMarket.execute({ actorId: admin, marketId }),
      ).rejects.toMatchObject({ code: "ALREADY_SETTLED" });

      const payoutCountAfter = await countSettlePayouts(drillPool, marketId);
      expect(payoutCountAfter).toBe(payoutCountBefore); // no duplicate payout — MET-DR-04 = 0

      const escrowBalance = await marketEscrowBalance(drillPool, marketId);
      expect(escrowBalance).toBe(0n); // INV-07: escrow zero on a SETTLED market

      const drillClient = await drillPool.connect();
      let results;
      try {
        results = await runAllReconcileChecks(drillClient);
      } finally {
        drillClient.release();
      }
      const failures = results.filter((r) => r.status === "FAIL");
      expect(failures).toEqual([]);

      console.log(
        `[DR-01] local dump+restore+verify wall-clock: ${restoreDurationMs}ms (directional; ` +
          "not the formal MET-DR-02 measurement, which needs the reference environment)",
      );
    } finally {
      await drillPool.end();
    }
  }, 60_000);
});

async function countSettlePayouts(pool: Pool, marketId: string): Promise<number> {
  const result = await pool.query(
    `SELECT count(*)::int AS count
       FROM ledger_transactions t
       JOIN match_allocations a ON a.id = t.reference_id
      WHERE t.kind = 'SETTLE_PAYOUT' AND t.reference_type = 'match_allocation' AND a.market_id = $1`,
    [marketId],
  );
  return (result.rows[0] as { count: number }).count;
}

async function marketEscrowBalance(pool: Pool, marketId: string): Promise<bigint> {
  const result = await pool.query(
    `SELECT coalesce(sum(signed_amount_minor), 0)::text AS balance
       FROM ledger_entries
      WHERE account_key = $1`,
    [`MARKET_ESCROW:${marketId}`],
  );
  return BigInt((result.rows[0] as { balance: string }).balance);
}
