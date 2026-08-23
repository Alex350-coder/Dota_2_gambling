import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleGameRepository } from "@/infra/db/repositories/game-repository";
import { DrizzleTournamentRepository } from "@/infra/db/repositories/tournament-repository";
import { DrizzleMatchRepository } from "@/infra/db/repositories/match-repository";
import { DrizzleMarketTypeRepository } from "@/infra/db/repositories/market-type-repository";
import { DrizzleEconomicProfileRepository } from "@/infra/db/repositories/economic-profile-repository";
import { DrizzleStreamerRepository } from "@/infra/db/repositories/streamer-repository";
import { DrizzleUserRepository } from "@/infra/db/repositories/user-repository";
import { DrizzleMarketRepository } from "@/infra/db/repositories/market-repository";
import { DrizzleOutcomeRepository } from "@/infra/db/repositories/outcome-repository";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { CreateGameUseCase } from "@/application/catalog/game";
import { CreateTournamentUseCase } from "@/application/catalog/tournament";
import { CreateMatchUseCase } from "@/application/catalog/match";
import { CreateMarketTypeUseCase } from "@/application/catalog/market-type";
import { CreateEconomicProfileUseCase } from "@/application/catalog/economic-profile";
import { CreateStreamerUseCase } from "@/application/catalog/streamer";
import { CreateMarketUseCase } from "@/application/catalog/create-market";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("CreateMarketUseCase", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const audit = new DrizzleAuditWriter();

  const createGame = new CreateGameUseCase<DbTx>({
    uow,
    games: (tx) => new DrizzleGameRepository(tx),
    ids,
    audit,
  });
  const createTournament = new CreateTournamentUseCase<DbTx>({
    uow,
    games: (tx) => new DrizzleGameRepository(tx),
    tournaments: (tx) => new DrizzleTournamentRepository(tx),
    ids,
    audit,
  });
  const createMatch = new CreateMatchUseCase<DbTx>({
    uow,
    tournaments: (tx) => new DrizzleTournamentRepository(tx),
    matches: (tx) => new DrizzleMatchRepository(tx),
    ids,
    audit,
  });
  const createMarketType = new CreateMarketTypeUseCase<DbTx>({
    uow,
    marketTypes: (tx) => new DrizzleMarketTypeRepository(tx),
    ids,
    audit,
  });
  const createEconomicProfile = new CreateEconomicProfileUseCase<DbTx>({
    uow,
    economicProfiles: (tx) => new DrizzleEconomicProfileRepository(tx),
    ids,
    audit,
  });
  const createStreamer = new CreateStreamerUseCase<DbTx>({
    uow,
    users: (tx) => new DrizzleUserRepository(tx),
    streamers: (tx) => new DrizzleStreamerRepository(tx),
    ids,
    audit,
  });
  const createMarket = new CreateMarketUseCase<DbTx>({
    uow,
    matches: (tx) => new DrizzleMatchRepository(tx),
    marketTypes: (tx) => new DrizzleMarketTypeRepository(tx),
    streamers: (tx) => new DrizzleStreamerRepository(tx),
    economicProfiles: (tx) => new DrizzleEconomicProfileRepository(tx),
    markets: (tx) => new DrizzleMarketRepository(tx),
    outcomes: (tx) => new DrizzleOutcomeRepository(tx),
    ids,
    audit,
  });

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createAdmin(): Promise<string> {
    const userId = ids.next();
    await pool.query(
      "INSERT INTO users (id, email, status, date_of_birth) VALUES ($1, $2, 'ACTIVE', '1990-01-01')",
      [userId, `admin-${randomUUID()}@example.test`],
    );
    return userId;
  }

  async function createFixtures(actorId: string): Promise<{
    matchId: string;
    marketTypeId: string;
    streamerId: string;
    economicProfileId: string;
  }> {
    const game = await createGame.execute({ actorId, slug: `g-${randomUUID()}`, name: "G" });
    const [modeRow] = await pool
      .query("INSERT INTO game_modes (game_id, name) VALUES ($1, 'Std') RETURNING id", [game.id])
      .then((r) => r.rows);
    const tournament = await createTournament.execute({
      actorId,
      gameId: game.id,
      name: "T",
      startsAt: new Date(),
    });
    const match = await createMatch.execute({
      actorId,
      tournamentId: tournament.id,
      gameModeId: modeRow.id as string,
      scheduledAt: new Date(),
    });
    const marketType = await createMarketType.execute({
      actorId,
      code: `MW_${randomUUID()}`,
      name: "Match Winner",
      outcomeCardinality: "BINARY",
    });
    const profile = await createEconomicProfile.execute({
      actorId,
      oddsNum: 18,
      oddsDen: 10,
      streamerCommissionBps: 2000,
      platformFeeBps: 0,
      currency: "PEN",
      minStakeMinor: 100n,
      maxStakeMinor: 10_000_000n,
    });
    const streamerUserId = ids.next();
    await pool.query(
      "INSERT INTO users (id, email, status, date_of_birth) VALUES ($1, $2, 'ACTIVE', '1990-01-01')",
      [streamerUserId, `streamer-${randomUUID()}@example.test`],
    );
    const streamer = await createStreamer.execute({
      actorId,
      userId: streamerUserId,
      displayName: "S",
      defaultCommissionBps: 2000,
    });

    return {
      matchId: match.id,
      marketTypeId: marketType.id,
      streamerId: streamer.id,
      economicProfileId: profile.id,
    };
  }

  it("creates a market with outcomes and emits exactly one MARKET_CREATED audit event", async () => {
    const actorId = await createAdmin();
    const fx = await createFixtures(actorId);

    const market = await createMarket.execute({
      actorId,
      matchId: fx.matchId,
      marketTypeId: fx.marketTypeId,
      streamerId: fx.streamerId,
      economicProfileId: fx.economicProfileId,
      closesAt: new Date(Date.now() + 3600_000),
      outcomes: [
        { code: "TEAM_A", label: "Team A" },
        { code: "TEAM_B", label: "Team B" },
      ],
    });

    expect(market.status).toBe("DRAFT");

    const rows = await pool
      .query("SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'MARKET_CREATED'", [
        market.id,
      ])
      .then((r) => r.rows);
    expect(rows).toHaveLength(1);

    const outcomeRows = await pool
      .query("SELECT code FROM outcomes WHERE market_id = $1 ORDER BY code", [market.id])
      .then((r) => r.rows);
    expect(outcomeRows).toHaveLength(2);
  });

  it("rejects fewer than two outcomes", async () => {
    const actorId = await createAdmin();
    const fx = await createFixtures(actorId);

    await expect(
      createMarket.execute({
        actorId,
        matchId: fx.matchId,
        marketTypeId: fx.marketTypeId,
        streamerId: fx.streamerId,
        economicProfileId: fx.economicProfileId,
        closesAt: new Date(Date.now() + 3600_000),
        outcomes: [{ code: "TEAM_A", label: "Team A" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", details: { reason: "TOO_FEW_OUTCOMES" } });
  });

  it("rejects a missing economic profile with RESOURCE_NOT_FOUND", async () => {
    const actorId = await createAdmin();
    const fx = await createFixtures(actorId);

    await expect(
      createMarket.execute({
        actorId,
        matchId: fx.matchId,
        marketTypeId: fx.marketTypeId,
        streamerId: fx.streamerId,
        economicProfileId: randomUUID(),
        closesAt: new Date(Date.now() + 3600_000),
        outcomes: [
          { code: "TEAM_A", label: "Team A" },
          { code: "TEAM_B", label: "Team B" },
        ],
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("rejects a non-binary market type with UNSUPPORTED_MARKET_MODEL", async () => {
    const actorId = await createAdmin();
    const fx = await createFixtures(actorId);
    // CreateMarketTypeUseCase itself already rejects N_ARY at creation time; insert
    // directly via the repository to exercise create-market's own defense-in-depth guard.
    const nAry = await uow.run((tx: DbTx) =>
      new DrizzleMarketTypeRepository(tx).create(randomUUID(), {
        code: `TF_${randomUUID()}`,
        name: "Top Fragger",
        outcomeCardinality: "N_ARY",
      }),
    );

    await expect(
      createMarket.execute({
        actorId,
        matchId: fx.matchId,
        marketTypeId: nAry.id,
        streamerId: fx.streamerId,
        economicProfileId: fx.economicProfileId,
        closesAt: new Date(Date.now() + 3600_000),
        outcomes: [
          { code: "A", label: "A" },
          { code: "B", label: "B" },
          { code: "C", label: "C" },
        ],
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_MARKET_MODEL" });
  });
});
