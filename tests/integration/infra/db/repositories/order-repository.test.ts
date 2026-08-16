import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleOrderRepository } from "@/infra/db/repositories/order-repository";
import { DomainError } from "@/domain/errors";
import { toMinor } from "@/domain/money";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleOrderRepository", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);

  let userAId: string;
  let userBId: string;
  let marketId: string;
  let outcomeId: string;

  async function insertBetOrder(
    betSlipUserId: string,
    overrides: { idempotencyKey?: string } = {},
  ) {
    const betSlipResult = await pool.query(
      `INSERT INTO bet_slips (user_id) VALUES ($1) RETURNING id`,
      [betSlipUserId],
    );
    const betSlipId = betSlipResult.rows[0].id as string;

    const idempotencyKey = overrides.idempotencyKey ?? `key-${randomUUID()}`;
    const result = await pool.query(
      `INSERT INTO bet_orders
         (bet_slip_id, user_id, market_id, outcome_id, currency, requested_minor, matched_minor,
          unmatched_minor, released_minor, odds_num, odds_den, commission_bps, idempotency_key)
       VALUES ($1, $2, $3, $4, 'PEN', 10000, 3000, 7000, 0, 18, 10, 2000, $5)
       RETURNING id`,
      [betSlipId, betSlipUserId, marketId, outcomeId, idempotencyKey],
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
    const [userA, userB] = await Promise.all([
      pool.query(
        `INSERT INTO users (email, date_of_birth) VALUES ($1, '1990-01-01') RETURNING id`,
        [`order-owner-a-${randomUUID()}@example.test`],
      ),
      pool.query(
        `INSERT INTO users (email, date_of_birth) VALUES ($1, '1990-01-01') RETURNING id`,
        [`order-owner-b-${randomUUID()}@example.test`],
      ),
    ]);
    userAId = userA.rows[0].id as string;
    userBId = userB.rows[0].id as string;

    marketId = await seedMarket(pool, userAId);
    const outcomeResult = await pool.query(
      `INSERT INTO outcomes (market_id, code, label) VALUES ($1, 'A', 'Team A') RETURNING id`,
      [marketId],
    );
    outcomeId = outcomeResult.rows[0].id as string;
  });

  it("returns the owner's order by id", async () => {
    const orderId = await insertBetOrder(userAId);

    const order = await uow.run((tx: DbTx) =>
      new DrizzleOrderRepository(tx, userAId).findById(orderId),
    );

    expect(order).not.toBeNull();
    expect(order?.userId).toBe(userAId);
    expect(order?.requestedMinor).toBe(10000n);
    expect(order?.matchedMinor).toBe(3000n);
  });

  it("returns null when another user's order id is requested (cross-user isolation)", async () => {
    const orderId = await insertBetOrder(userAId);

    const order = await uow.run((tx: DbTx) =>
      new DrizzleOrderRepository(tx, userBId).findById(orderId),
    );

    expect(order).toBeNull();
  });

  it("updates the mutable fields of the owner's order", async () => {
    const orderId = await insertBetOrder(userAId);

    await uow.run(async (tx: DbTx) => {
      const repo = new DrizzleOrderRepository(tx, userAId);
      const existing = await repo.findById(orderId);
      if (!existing) throw new Error("fixture order not found");

      await repo.save({
        ...existing,
        matchedMinor: toMinor(10000n),
        unmatchedMinor: toMinor(0n),
        status: "MATCHED",
      });
    });

    const updated = await uow.run((tx: DbTx) =>
      new DrizzleOrderRepository(tx, userAId).findById(orderId),
    );
    expect(updated?.matchedMinor).toBe(10000n);
    expect(updated?.status).toBe("MATCHED");
  });

  it("refuses to update an order owned by a different user", async () => {
    const orderId = await insertBetOrder(userAId);

    const existing = await uow.run((tx: DbTx) =>
      new DrizzleOrderRepository(tx, userAId).findById(orderId),
    );
    if (!existing) throw new Error("fixture order not found");

    await expect(
      uow.run((tx: DbTx) => new DrizzleOrderRepository(tx, userBId).save(existing)),
    ).rejects.toThrow(DomainError);
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
