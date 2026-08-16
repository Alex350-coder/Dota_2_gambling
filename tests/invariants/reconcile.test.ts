import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { runAllReconcileChecks, runReconcileCheck } from "@/infra/db/reconcile-queries";
import { testDbConfig } from "../helpers/test-db-config";
import { resetAndMigrate } from "../helpers/reset-db";

describe("reconcile invariants (INV-01..INV-15)", () => {
  const pool = createPool(testDbConfig());

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetAndMigrate(pool);
  });

  async function seedUserWithFaucetCredit(p: Pool, availableMinor = 100000) {
    const userResult = await p.query(
      `INSERT INTO users (email, date_of_birth) VALUES ($1, '1990-01-01') RETURNING id`,
      [`reconcile-user-${randomUUID()}@example.test`],
    );
    const userId = userResult.rows[0].id as string;

    await p.query(
      `INSERT INTO wallets (user_id, currency, available_minor, locked_minor) VALUES ($1, 'PEN', $2, 0)`,
      [userId, availableMinor],
    );

    const txResult = await p.query(
      `INSERT INTO ledger_transactions
         (kind, reference_type, reference_id, idempotency_key, actor_type, actor_id)
       VALUES ('FAUCET', 'bet_order', $1, $2, 'SYSTEM', NULL)
       RETURNING id`,
      [randomUUID(), `faucet-${randomUUID()}`],
    );
    const transactionId = txResult.rows[0].id as string;

    await p.query(
      `INSERT INTO ledger_entries (transaction_id, account_key, currency, signed_amount_minor)
       VALUES ($1, $2, 'PEN', $3), ($1, 'SIMULATION_FAUCET', 'PEN', $4)`,
      [transactionId, `USER_AVAILABLE:${userId}`, availableMinor, -availableMinor],
    );

    return { userId, transactionId };
  }

  it("all invariants pass against a clean, consistent fixture", async () => {
    await seedUserWithFaucetCredit(pool);

    const client = await pool.connect();
    try {
      const results = await runAllReconcileChecks(client);
      const failures = results.filter((result) => result.status === "FAIL");
      expect(failures).toEqual([]);
      expect(results).toHaveLength(15);
    } finally {
      client.release();
    }
  });

  it("INV-03 detects a wallet available_minor desynced from the ledger", async () => {
    const { userId } = await seedUserWithFaucetCredit(pool);
    await pool.query(
      `UPDATE wallets SET available_minor = available_minor + 500 WHERE user_id = $1`,
      [userId],
    );

    const client = await pool.connect();
    try {
      const result = await runReconcileCheck(client, {
        id: "INV-03",
        description: "wallets.available_minor = balance(USER_AVAILABLE:u)",
        sql: `
          SELECT w.user_id
          FROM wallets w
          LEFT JOIN ledger_entries e
            ON e.account_key = 'USER_AVAILABLE:' || w.user_id::text AND e.currency = w.currency
          GROUP BY w.user_id, w.available_minor
          HAVING w.available_minor <> COALESCE(SUM(e.signed_amount_minor), 0)
        `,
      });
      expect(result.status).toBe("FAIL");
    } finally {
      client.release();
    }
  });

  it("INV-06 detects an escrow balance that doesn't match 2x active allocation stake", async () => {
    const { userId } = await seedUserWithFaucetCredit(pool);
    const marketId = await seedMarket(pool, userId);
    const outcomeId = await seedOutcome(pool, marketId);
    const orderAId = await seedBetOrder(pool, userId, marketId, outcomeId);
    const orderBId = await seedBetOrder(pool, userId, marketId, outcomeId);

    await pool.query(
      `INSERT INTO match_allocations (market_id, order_a_id, order_b_id, sequence, matched_minor)
       VALUES ($1, $2, $3, 1, 3000)`,
      [marketId, orderAId, orderBId],
    );

    const client = await pool.connect();
    try {
      const results = await runAllReconcileChecks(client);
      const inv06 = results.find((result) => result.id === "INV-06");
      expect(inv06?.status).toBe("FAIL");
    } finally {
      client.release();
    }
  });

  it("INV-14 detects an allocation with two SETTLE_PAYOUT transactions", async () => {
    const { userId } = await seedUserWithFaucetCredit(pool);
    const marketId = await seedMarket(pool, userId);
    const outcomeId = await seedOutcome(pool, marketId);
    const orderAId = await seedBetOrder(pool, userId, marketId, outcomeId);
    const orderBId = await seedBetOrder(pool, userId, marketId, outcomeId);

    const allocationResult = await pool.query(
      `INSERT INTO match_allocations (market_id, order_a_id, order_b_id, sequence, matched_minor)
       VALUES ($1, $2, $3, 1, 3000) RETURNING id`,
      [marketId, orderAId, orderBId],
    );
    const allocationId = allocationResult.rows[0].id as string;

    for (const suffix of ["a", "b"]) {
      const txResult = await pool.query(
        `INSERT INTO ledger_transactions
           (kind, reference_type, reference_id, idempotency_key, actor_type)
         VALUES ('SETTLE_PAYOUT', 'match_allocation', $1, $2, 'SYSTEM')
         RETURNING id`,
        [allocationId, `payout-${allocationId}-${suffix}`],
      );
      const transactionId = txResult.rows[0].id as string;
      await pool.query(
        `INSERT INTO ledger_entries (transaction_id, account_key, currency, signed_amount_minor)
         VALUES ($1, $2, 'PEN', 3000), ($1, $3, 'PEN', -3000)`,
        [transactionId, `USER_AVAILABLE:${userId}`, `MARKET_ESCROW:${marketId}`],
      );
    }

    const client = await pool.connect();
    try {
      const results = await runAllReconcileChecks(client);
      const inv14 = results.find((result) => result.id === "INV-14");
      expect(inv14?.status).toBe("FAIL");
    } finally {
      client.release();
    }
  });

  it("INV-11 detects a disabled ledger immutability trigger", async () => {
    await seedUserWithFaucetCredit(pool);
    await pool.query(
      `ALTER TABLE ledger_transactions DISABLE TRIGGER trg_ledger_transactions_immutable`,
    );

    try {
      const client = await pool.connect();
      try {
        const results = await runAllReconcileChecks(client);
        const inv11 = results.find((result) => result.id === "INV-11");
        expect(inv11?.status).toBe("FAIL");
      } finally {
        client.release();
      }
    } finally {
      await pool.query(
        `ALTER TABLE ledger_transactions ENABLE TRIGGER trg_ledger_transactions_immutable`,
      );
    }
  });

  it("rejects an unbalanced transaction before it can violate INV-01/INV-02 (DB trigger)", async () => {
    const txResult = await pool.query(
      `INSERT INTO ledger_transactions
         (kind, reference_type, reference_id, idempotency_key, actor_type)
       VALUES ('ADJUSTMENT', 'bet_order', $1, $2, 'SYSTEM')
       RETURNING id`,
      [randomUUID(), `unbalanced-${randomUUID()}`],
    );
    const transactionId = txResult.rows[0].id as string;

    await expect(
      pool.query(
        `INSERT INTO ledger_entries (transaction_id, account_key, currency, signed_amount_minor)
         VALUES ($1, 'USER_AVAILABLE:deadbeef', 'PEN', 100)`,
        [transactionId],
      ),
    ).rejects.toThrow(/does not sum to zero/);
  });

  it("rejects duplicate idempotency_key before it can violate INV-15 (DB unique constraint)", async () => {
    const key = `dup-${randomUUID()}`;
    await pool.query(
      `INSERT INTO ledger_transactions
         (kind, reference_type, reference_id, idempotency_key, actor_type)
       VALUES ('FAUCET', 'bet_order', $1, $2, 'SYSTEM')`,
      [randomUUID(), key],
    );

    await expect(
      pool.query(
        `INSERT INTO ledger_transactions
           (kind, reference_type, reference_id, idempotency_key, actor_type)
         VALUES ('FAUCET', 'bet_order', $1, $2, 'SYSTEM')`,
        [randomUUID(), key],
      ),
    ).rejects.toThrow(/idempotency_key/);
  });
});

async function seedMarket(pool: Pool, streamerUserId: string): Promise<string> {
  const gameResult = await pool.query(
    `INSERT INTO games (slug, name) VALUES ($1, 'Dota 2') RETURNING id`,
    [`dota2-${randomUUID()}`],
  );
  const gameId = gameResult.rows[0].id as string;

  const gameModeResult = await pool.query(
    `INSERT INTO game_modes (game_id, name) VALUES ($1, 'Standard') RETURNING id`,
    [gameId],
  );
  const gameModeId = gameModeResult.rows[0].id as string;

  const tournamentResult = await pool.query(
    `INSERT INTO tournaments (game_id, name, starts_at) VALUES ($1, 'The International', now()) RETURNING id`,
    [gameId],
  );
  const tournamentId = tournamentResult.rows[0].id as string;

  const matchResult = await pool.query(
    `INSERT INTO matches (tournament_id, game_mode_id, scheduled_at) VALUES ($1, $2, now()) RETURNING id`,
    [tournamentId, gameModeId],
  );
  const matchId = matchResult.rows[0].id as string;

  const marketTypeResult = await pool.query(
    `INSERT INTO market_types (code, name) VALUES ($1, 'Match Winner') RETURNING id`,
    [`match-winner-${randomUUID()}`],
  );
  const marketTypeId = marketTypeResult.rows[0].id as string;

  const streamerResult = await pool.query(
    `INSERT INTO streamers (user_id, display_name) VALUES ($1, 'Streamer') RETURNING id`,
    [streamerUserId],
  );
  const streamerId = streamerResult.rows[0].id as string;

  const profileResult = await pool.query(
    `INSERT INTO economic_profiles
       (odds_num, odds_den, streamer_commission_bps, platform_fee_bps, currency, min_stake_minor, max_stake_minor)
     VALUES (18, 10, 2000, 0, 'PEN', 100, 10000000) RETURNING id`,
  );
  const economicProfileId = profileResult.rows[0].id as string;

  const marketResult = await pool.query(
    `INSERT INTO markets (match_id, market_type_id, streamer_id, economic_profile_id, closes_at)
     VALUES ($1, $2, $3, $4, now() + interval '1 hour') RETURNING id`,
    [matchId, marketTypeId, streamerId, economicProfileId],
  );
  return marketResult.rows[0].id as string;
}

async function seedOutcome(pool: Pool, marketId: string): Promise<string> {
  const outcomeResult = await pool.query(
    `INSERT INTO outcomes (market_id, code, label) VALUES ($1, 'A', 'Team A') RETURNING id`,
    [marketId],
  );
  return outcomeResult.rows[0].id as string;
}

async function seedBetOrder(
  pool: Pool,
  userId: string,
  marketId: string,
  outcomeId: string,
): Promise<string> {
  const betSlipResult = await pool.query(
    `INSERT INTO bet_slips (user_id) VALUES ($1) RETURNING id`,
    [userId],
  );
  const betSlipId = betSlipResult.rows[0].id as string;

  const result = await pool.query(
    `INSERT INTO bet_orders
       (bet_slip_id, user_id, market_id, outcome_id, currency, requested_minor, matched_minor,
        unmatched_minor, released_minor, odds_num, odds_den, commission_bps, idempotency_key)
     VALUES ($1, $2, $3, $4, 'PEN', 10000, 3000, 7000, 0, 18, 10, 2000, $5)
     RETURNING id`,
    [betSlipId, userId, marketId, outcomeId, `key-${randomUUID()}`],
  );
  return result.rows[0].id as string;
}
