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
 * DR-02 (`Claude/ops/DISASTER_RECOVERY.md` §5): "Restore to a point mid-placement (transaction
 * lost). Pass criteria: no orphan reservation; wallet balances match ledger."
 *
 * RULE-B07 requires the fund reservation and the order insert to happen in the *same* database
 * transaction, so there is no application-visible "mid-placement" state to lose — a crash before
 * commit leaves nothing, a crash after commit leaves the whole atomic operation. This drill
 * proves that guarantee survives a real dump/restore cycle: place an order, take the backup at
 * exactly that point, restore it, and confirm the restored database has neither a dangling
 * reservation (locked funds with no order) nor a dangling order (order with no matching lock).
 */
describe("DR-02: restore around order placement, no orphan reservation", () => {
  const sourceConfig = testDbConfig();
  const pool = createPool(sourceConfig);
  const drillDbName = `dr02_${randomUUID().replace(/-/g, "")}`;
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

  it("wallet locked balance matches the ledger after a restore taken right after placement", async () => {
    const lifecycle = buildLifecycle(pool);
    const { marketId, outcomeAId, outcomeBId } = await lifecycle.createMatchedMarket();
    // createMatchedMarket already places two opposing 10_000-minor orders that fully match each
    // other, so place one more, deliberately unmatched (no counterparty on this new outcome
    // request), to get a live reservation with an unmatched remainder to check.
    const bettor = await lifecycle.createUser();
    const order = await lifecycle.placeOrder.execute({
      userId: bettor,
      marketId,
      outcomeId: outcomeBId,
      requestedMinor: 4_000n,
      idempotencyKey: randomUUID(),
    });
    expect(order.unmatchedMinor).toBeGreaterThan(0n);

    const { dumpPath, cleanup } = await dumpDatabase(sourceConfig.DATABASE_URL);
    try {
      await createDrillDatabase(adminUrl(sourceConfig.DATABASE_URL), drillDbName);
      await restoreDatabase(dumpPath, drillUrl);
    } finally {
      await cleanup();
    }

    const drillPool = createPool({ ...sourceConfig, DATABASE_URL: drillUrl });
    try {
      const restoredOrder = await drillPool.query(
        `SELECT requested_minor, matched_minor, unmatched_minor, released_minor
           FROM bet_orders WHERE id = $1`,
        [order.id],
      );
      expect(restoredOrder.rows).toHaveLength(1); // the order survived the restore — not lost

      const wallet = await walletFor(drillPool, bettor);
      const ledgerLocked = await ledgerLockedBalance(drillPool, bettor);
      expect(wallet.locked).toBe(ledgerLocked); // no orphan reservation — RULE-F08/INV-04

      const drillClient = await drillPool.connect();
      let results;
      try {
        results = await runAllReconcileChecks(drillClient);
      } finally {
        drillClient.release();
      }
      expect(results.filter((r) => r.status === "FAIL")).toEqual([]);
    } finally {
      await drillPool.end();
    }

    void outcomeAId; // fixture returns it; unused in this drill, kept for readability of the tuple
  }, 60_000);
});

async function walletFor(
  pool: Pool,
  userId: string,
): Promise<{ available: bigint; locked: bigint }> {
  const result = await pool.query(
    `SELECT available_minor, locked_minor FROM wallets WHERE user_id = $1`,
    [userId],
  );
  const row = result.rows[0] as { available_minor: string; locked_minor: string };
  return { available: BigInt(row.available_minor), locked: BigInt(row.locked_minor) };
}

async function ledgerLockedBalance(pool: Pool, userId: string): Promise<bigint> {
  const result = await pool.query(
    `SELECT coalesce(sum(signed_amount_minor), 0)::text AS balance
       FROM ledger_entries WHERE account_key = $1`,
    [`USER_LOCKED:${userId}`],
  );
  return BigInt((result.rows[0] as { balance: string }).balance);
}
