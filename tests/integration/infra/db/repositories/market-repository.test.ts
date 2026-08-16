import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleMarketRepository } from "@/infra/db/repositories/market-repository";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleMarketRepository", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);

  let marketId: string;

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    const userResult = await pool.query(
      `INSERT INTO users (email, date_of_birth) VALUES ($1, '1990-01-01') RETURNING id`,
      [`market-streamer-${randomUUID()}@example.test`],
    );
    const streamerUserId = userResult.rows[0].id as string;

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
    marketId = marketResult.rows[0].id as string;
  });

  it("returns a market by id", async () => {
    const market = await uow.run((tx: DbTx) => new DrizzleMarketRepository(tx).findById(marketId));

    expect(market).not.toBeNull();
    expect(market?.id).toBe(marketId);
    expect(market?.status).toBe("DRAFT");
  });

  it("returns null for an unknown market id", async () => {
    const market = await uow.run((tx: DbTx) =>
      new DrizzleMarketRepository(tx).findById(randomUUID()),
    );

    expect(market).toBeNull();
  });
});
