import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";

describe("0008_results_settlement migration", () => {
  const pool = createPool(testDbConfig());

  let marketId: string;
  let outcomeId: string;

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
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

    const userResult = await pool.query(
      `INSERT INTO users (email, date_of_birth) VALUES ($1, '2000-01-01') RETURNING id`,
      [`streamer-${Math.random()}@example.com`],
    );
    const userId = userResult.rows[0].id as string;

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
  });

  async function insertConfirmedResult(): Promise<string> {
    const result = await pool.query(
      `INSERT INTO market_results
         (market_id, provider_key, trust_level, winning_outcome_id, raw_payload, payload_hash, status)
       VALUES ($1, 'MANUAL_ADMIN', 'SINGLE_SOURCE', $2, '{}'::jsonb, 'hash', 'CONFIRMED')
       RETURNING id`,
      [marketId, outcomeId],
    );
    return result.rows[0].id as string;
  }

  it("accepts a single CONFIRMED result for a market", async () => {
    const id = await insertConfirmedResult();
    expect(id).toBeDefined();
  });

  it("rejects a second CONFIRMED result for the same market (one_confirmed_result_per_market)", async () => {
    await insertConfirmedResult();
    await expect(insertConfirmedResult()).rejects.toThrow(/one_confirmed_result_per_market/);
  });

  it("rejects a second COMPLETED settlement run for the same market (one_completed_run_per_market)", async () => {
    const resultId = await insertConfirmedResult();

    await pool.query(
      `INSERT INTO settlement_runs (market_id, result_id, status) VALUES ($1, $2, 'COMPLETED')`,
      [marketId, resultId],
    );

    await expect(
      pool.query(
        `INSERT INTO settlement_runs (market_id, result_id, status) VALUES ($1, $2, 'COMPLETED')`,
        [marketId, resultId],
      ),
    ).rejects.toThrow(/one_completed_run_per_market/);
  });
});
