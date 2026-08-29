import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleBookRepository } from "@/infra/db/repositories/book";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleBookRepository", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);

  let marketId: string;
  let outcomeAId: string;
  let outcomeBId: string;
  let incomingUserId: string;

  async function insertBetOrder(
    userId: string,
    outcomeId: string,
    overrides: {
      unmatchedMinor?: number;
      matchedMinor?: number;
      status?: string;
      createdAt?: string;
      id?: string;
    } = {},
  ): Promise<string> {
    const betSlipResult = await pool.query(
      `INSERT INTO bet_slips (user_id) VALUES ($1) RETURNING id`,
      [userId],
    );
    const betSlipId = betSlipResult.rows[0].id as string;

    const id = overrides.id ?? randomUUID();
    const unmatchedMinor = overrides.unmatchedMinor ?? 5000;
    const matchedMinor = overrides.matchedMinor ?? 5000 - unmatchedMinor;
    const status = overrides.status ?? "OPEN";
    const createdAt = overrides.createdAt ?? new Date().toISOString();

    const result = await pool.query(
      `INSERT INTO bet_orders
         (id, bet_slip_id, user_id, market_id, outcome_id, currency, requested_minor, matched_minor,
          unmatched_minor, released_minor, odds_num, odds_den, commission_bps, status,
          idempotency_key, created_at)
       VALUES ($1, $2, $3, $4, $5, 'PEN', 5000, $6, $7, 0, 18, 10, 2000, $8, $9, $10)
       RETURNING id`,
      [
        id,
        betSlipId,
        userId,
        marketId,
        outcomeId,
        matchedMinor,
        unmatchedMinor,
        status,
        `key-${randomUUID()}`,
        createdAt,
      ],
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
    const userA = await pool.query(
      `INSERT INTO users (email, date_of_birth) VALUES ($1, '1990-01-01') RETURNING id`,
      [`book-owner-a-${randomUUID()}@example.test`],
    );
    incomingUserId = userA.rows[0].id as string;

    marketId = await seedMarket(pool, incomingUserId);
    const outcomeA = await pool.query(
      `INSERT INTO outcomes (market_id, code, label) VALUES ($1, 'A', 'Team A') RETURNING id`,
      [marketId],
    );
    outcomeAId = outcomeA.rows[0].id as string;
    const outcomeB = await pool.query(
      `INSERT INTO outcomes (market_id, code, label) VALUES ($1, 'B', 'Team B') RETURNING id`,
      [marketId],
    );
    outcomeBId = outcomeB.rows[0].id as string;
  });

  it("returns only opposing-outcome, other-user, OPEN orders with unmatched stake", async () => {
    const otherUser = await pool.query(
      `INSERT INTO users (email, date_of_birth) VALUES ($1, '1990-01-01') RETURNING id`,
      [`book-owner-b-${randomUUID()}@example.test`],
    );
    const otherUserId = otherUser.rows[0].id as string;

    const restingId = await insertBetOrder(otherUserId, outcomeBId);
    await insertBetOrder(incomingUserId, outcomeBId); // same user as incoming -> excluded
    await insertBetOrder(otherUserId, outcomeAId); // same outcome as incoming -> excluded
    await insertBetOrder(otherUserId, outcomeBId, { status: "MATCHED" }); // not OPEN -> excluded
    await insertBetOrder(otherUserId, outcomeBId, { unmatchedMinor: 0 }); // fully matched -> excluded

    const resting = await uow.run((tx: DbTx) =>
      new DrizzleBookRepository(tx).findRestingOrders(marketId, outcomeAId, incomingUserId),
    );

    expect(resting.map((o) => o.id)).toEqual([restingId]);
  });

  it("orders resting orders by (created_at ASC, id ASC) — FIFO with a deterministic tie-break", async () => {
    const otherUser = await pool.query(
      `INSERT INTO users (email, date_of_birth) VALUES ($1, '1990-01-01') RETURNING id`,
      [`book-owner-c-${randomUUID()}@example.test`],
    );
    const otherUserId = otherUser.rows[0].id as string;

    const sameTimestamp = "2026-01-01T00:00:00.000Z";
    const idLow = "00000000-0000-0000-0000-000000000001";
    const idHigh = "00000000-0000-0000-0000-000000000002";

    await insertBetOrder(otherUserId, outcomeBId, {
      id: idHigh,
      createdAt: sameTimestamp,
    });
    await insertBetOrder(otherUserId, outcomeBId, {
      id: idLow,
      createdAt: sameTimestamp,
    });
    const earliestId = await insertBetOrder(otherUserId, outcomeBId, {
      createdAt: "2025-12-31T23:59:59.000Z",
    });

    const resting = await uow.run((tx: DbTx) =>
      new DrizzleBookRepository(tx).findRestingOrders(marketId, outcomeAId, incomingUserId),
    );

    expect(resting.map((o) => o.id)).toEqual([earliestId, idLow, idHigh]);
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
