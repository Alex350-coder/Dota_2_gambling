import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createPool } from "@/infra/db/client";
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";

describe("0007_betting migration", () => {
  const pool = createPool(testDbConfig());

  let userId: string;
  let marketId: string;
  let outcomeId: string;
  let betSlipId: string;

  async function insertBetOrder(
    p: Pool,
    overrides: Partial<{
      requestedMinor: number;
      matchedMinor: number;
      unmatchedMinor: number;
      releasedMinor: number;
      idempotencyKey: string;
    }> = {},
  ): Promise<string> {
    const requested = overrides.requestedMinor ?? 10000;
    const matched = overrides.matchedMinor ?? 3000;
    const unmatched = overrides.unmatchedMinor ?? 7000;
    const released = overrides.releasedMinor ?? 0;
    const idempotencyKey = overrides.idempotencyKey ?? `key-${Math.random()}`;

    const result = await p.query(
      `INSERT INTO bet_orders
         (bet_slip_id, user_id, market_id, outcome_id, currency, requested_minor, matched_minor,
          unmatched_minor, released_minor, odds_num, odds_den, commission_bps, idempotency_key)
       VALUES ($1, $2, $3, $4, 'PEN', $5, $6, $7, $8, 18, 10, 2000, $9)
       RETURNING id`,
      [
        betSlipId,
        userId,
        marketId,
        outcomeId,
        requested,
        matched,
        unmatched,
        released,
        idempotencyKey,
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
    const userResult = await pool.query(
      `INSERT INTO users (email, date_of_birth) VALUES ($1, '2000-01-01') RETURNING id`,
      [`bettor-${Math.random()}@example.com`],
    );
    userId = userResult.rows[0].id as string;

    const gameResult = await pool.query(
      `INSERT INTO games (slug, name) VALUES ($1, 'Dota 2') RETURNING id`,
      [`dota2-${Math.random()}`],
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
      [`match-winner-${Math.random()}`],
    );
    const marketTypeId = marketTypeResult.rows[0].id as string;

    const streamerResult = await pool.query(
      `INSERT INTO streamers (user_id, display_name) VALUES ($1, 'Streamer') RETURNING id`,
      [userId],
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
    marketId = marketResult.rows[0].id as string;

    const outcomeResult = await pool.query(
      `INSERT INTO outcomes (market_id, code, label) VALUES ($1, 'A', 'Team A') RETURNING id`,
      [marketId],
    );
    outcomeId = outcomeResult.rows[0].id as string;

    const betSlipResult = await pool.query(
      `INSERT INTO bet_slips (user_id) VALUES ($1) RETURNING id`,
      [userId],
    );
    betSlipId = betSlipResult.rows[0].id as string;
  });

  it("accepts a bet_order where requested = matched + unmatched + released", async () => {
    const id = await insertBetOrder(pool);
    expect(id).toBeDefined();
  });

  it("rejects a bet_order where matched exceeds requested (RULE-B01)", async () => {
    await expect(
      insertBetOrder(pool, { requestedMinor: 1000, matchedMinor: 2000, unmatchedMinor: 0 }),
    ).rejects.toThrow(/chk_bo_matched_le_requested/);
  });

  it("rejects a bet_order where the parts don't sum to requested (RULE-B02)", async () => {
    await expect(
      insertBetOrder(pool, { requestedMinor: 1000, matchedMinor: 300, unmatchedMinor: 300 }),
    ).rejects.toThrow(/chk_bo_sum/);
  });

  it("rejects updates to non-status columns on match_allocations (RULE-B11)", async () => {
    const orderAId = await insertBetOrder(pool);
    const orderBId = await insertBetOrder(pool);

    const allocationResult = await pool.query(
      `INSERT INTO match_allocations (market_id, order_a_id, order_b_id, sequence, matched_minor)
       VALUES ($1, $2, $3, 1, 3000) RETURNING id`,
      [marketId, orderAId, orderBId],
    );
    const allocationId = allocationResult.rows[0].id as string;

    await expect(
      pool.query(`UPDATE match_allocations SET matched_minor = 4000 WHERE id = $1`, [allocationId]),
    ).rejects.toThrow(/immutable except status/);

    await expect(
      pool.query(`UPDATE match_allocations SET status = 'SETTLED' WHERE id = $1`, [allocationId]),
    ).resolves.toBeDefined();
  });
});
