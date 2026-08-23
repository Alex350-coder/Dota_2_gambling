import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleMarketRepository } from "@/infra/db/repositories/market-repository";
import { DrizzleMarketTypeRepository } from "@/infra/db/repositories/market-type-repository";
import { DrizzleEconomicProfileRepository } from "@/infra/db/repositories/economic-profile-repository";
import { DrizzleStreamerRepository } from "@/infra/db/repositories/streamer-repository";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleMarketRepository", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createFixtures(): Promise<{
    matchId: string;
    marketTypeId: string;
    streamerId: string;
    economicProfileId: string;
  }> {
    const userId = ids.next();
    await pool.query(
      "INSERT INTO users (id, email, status, date_of_birth) VALUES ($1, $2, 'ACTIVE', '1990-01-01')",
      [userId, `u-${randomUUID()}@example.test`],
    );
    const [gameRow] = await pool
      .query("INSERT INTO games (slug, name) VALUES ($1, 'G') RETURNING id", [`g-${randomUUID()}`])
      .then((r) => r.rows);
    const [tournamentRow] = await pool
      .query(
        "INSERT INTO tournaments (game_id, name, starts_at) VALUES ($1, 'T', now()) RETURNING id",
        [gameRow.id],
      )
      .then((r) => r.rows);
    const [modeRow] = await pool
      .query("INSERT INTO game_modes (game_id, name) VALUES ($1, 'Std') RETURNING id", [gameRow.id])
      .then((r) => r.rows);
    const [matchRow] = await pool
      .query(
        "INSERT INTO matches (tournament_id, game_mode_id, scheduled_at) VALUES ($1, $2, now()) RETURNING id",
        [tournamentRow.id, modeRow.id],
      )
      .then((r) => r.rows);

    const marketType = await uow.run(async (tx: DbTx) =>
      new DrizzleMarketTypeRepository(tx).create(randomUUID(), {
        code: `MW_${randomUUID()}`,
        name: "Match Winner",
        outcomeCardinality: "BINARY",
      }),
    );
    const streamer = await uow.run(async (tx: DbTx) =>
      new DrizzleStreamerRepository(tx).create({
        id: randomUUID(),
        userId,
        displayName: "S",
        defaultCommissionBps: 2000,
      }),
    );
    const profile = await uow.run(async (tx: DbTx) =>
      new DrizzleEconomicProfileRepository(tx).create({
        id: randomUUID(),
        oddsNum: 18,
        oddsDen: 10,
        streamerCommissionBps: 2000,
        platformFeeBps: 0,
        currency: "PEN",
        minStakeMinor: 100n,
        maxStakeMinor: 10_000_000n,
      }),
    );

    return {
      matchId: matchRow.id as string,
      marketTypeId: marketType.id,
      streamerId: streamer.id,
      economicProfileId: profile.id,
    };
  }

  it("creates a market and finds it by id and by matchId", async () => {
    const fx = await createFixtures();

    const created = await uow.run(async (tx: DbTx) =>
      new DrizzleMarketRepository(tx).create({
        id: randomUUID(),
        matchId: fx.matchId,
        marketTypeId: fx.marketTypeId,
        streamerId: fx.streamerId,
        economicProfileId: fx.economicProfileId,
        closesAt: new Date(Date.now() + 3600_000),
      }),
    );

    expect(created.status).toBe("DRAFT");

    const found = await uow.run(async (tx: DbTx) =>
      new DrizzleMarketRepository(tx).findById(created.id),
    );
    expect(found?.id).toBe(created.id);

    const byMatch = await uow.run(async (tx: DbTx) =>
      new DrizzleMarketRepository(tx).findByMatchId(fx.matchId),
    );
    expect(byMatch.some((m) => m.id === created.id)).toBe(true);
  });
});
