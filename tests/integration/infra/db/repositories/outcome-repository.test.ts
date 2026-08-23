import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleOutcomeRepository } from "@/infra/db/repositories/outcome-repository";
import { DrizzleMarketRepository } from "@/infra/db/repositories/market-repository";
import { DrizzleMarketTypeRepository } from "@/infra/db/repositories/market-type-repository";
import { DrizzleEconomicProfileRepository } from "@/infra/db/repositories/economic-profile-repository";
import { DrizzleStreamerRepository } from "@/infra/db/repositories/streamer-repository";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleOutcomeRepository", () => {
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

  async function createMarket(): Promise<string> {
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
    const market = await uow.run(async (tx: DbTx) =>
      new DrizzleMarketRepository(tx).create({
        id: randomUUID(),
        matchId: matchRow.id as string,
        marketTypeId: marketType.id,
        streamerId: streamer.id,
        economicProfileId: profile.id,
        closesAt: new Date(Date.now() + 3600_000),
      }),
    );
    return market.id;
  }

  it("creates outcomes and lists them by marketId", async () => {
    const marketId = await createMarket();

    await uow.run(async (tx: DbTx) =>
      new DrizzleOutcomeRepository(tx).create({
        id: randomUUID(),
        marketId,
        code: "TEAM_A",
        label: "Team A",
      }),
    );
    await uow.run(async (tx: DbTx) =>
      new DrizzleOutcomeRepository(tx).create({
        id: randomUUID(),
        marketId,
        code: "TEAM_B",
        label: "Team B",
      }),
    );

    const listed = await uow.run(async (tx: DbTx) =>
      new DrizzleOutcomeRepository(tx).listByMarketId(marketId),
    );
    expect(listed).toHaveLength(2);
    expect(listed.map((o) => o.code).sort()).toEqual(["TEAM_A", "TEAM_B"]);
  });
});
