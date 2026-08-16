import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleAllocationRepository } from "@/infra/db/repositories/allocation-repository";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleAllocationRepository", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);

  let userAId: string;
  let userBId: string;
  let userCId: string;
  let orderAId: string;
  let orderBId: string;

  async function insertBetOrder(userId: string, marketId: string, outcomeId: string) {
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

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    const [userA, userB, userC] = await Promise.all([
      pool.query(
        `INSERT INTO users (email, date_of_birth) VALUES ($1, '1990-01-01') RETURNING id`,
        [`alloc-owner-a-${randomUUID()}@example.test`],
      ),
      pool.query(
        `INSERT INTO users (email, date_of_birth) VALUES ($1, '1990-01-01') RETURNING id`,
        [`alloc-owner-b-${randomUUID()}@example.test`],
      ),
      pool.query(
        `INSERT INTO users (email, date_of_birth) VALUES ($1, '1990-01-01') RETURNING id`,
        [`alloc-owner-c-${randomUUID()}@example.test`],
      ),
    ]);
    userAId = userA.rows[0].id as string;
    userBId = userB.rows[0].id as string;
    userCId = userC.rows[0].id as string;

    const marketId = await seedMarket(pool, userAId);
    const outcomeResult = await pool.query(
      `INSERT INTO outcomes (market_id, code, label) VALUES ($1, 'A', 'Team A') RETURNING id`,
      [marketId],
    );
    const outcomeId = outcomeResult.rows[0].id as string;

    orderAId = await insertBetOrder(userAId, marketId, outcomeId);
    orderBId = await insertBetOrder(userBId, marketId, outcomeId);

    await pool.query(
      `INSERT INTO match_allocations (market_id, order_a_id, order_b_id, sequence, matched_minor)
       VALUES ($1, $2, $3, 1, 3000)`,
      [marketId, orderAId, orderBId],
    );
  });

  it("finds allocations for an order belonging to the owner", async () => {
    const allocations = await uow.run((tx: DbTx) =>
      new DrizzleAllocationRepository(tx, userAId).findByOrderId(orderAId),
    );

    expect(allocations).toHaveLength(1);
    expect(allocations[0]?.orderAId).toBe(orderAId);
    expect(allocations[0]?.orderBId).toBe(orderBId);
  });

  it("finds allocations when the owner is the counterparty (order_b side)", async () => {
    const allocations = await uow.run((tx: DbTx) =>
      new DrizzleAllocationRepository(tx, userBId).findByOrderId(orderBId),
    );

    expect(allocations).toHaveLength(1);
  });

  it("never returns allocations for a user unrelated to either side (cross-user isolation)", async () => {
    const allocations = await uow.run((tx: DbTx) =>
      new DrizzleAllocationRepository(tx, userCId).findByOrderId(orderAId),
    );

    expect(allocations).toHaveLength(0);
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
