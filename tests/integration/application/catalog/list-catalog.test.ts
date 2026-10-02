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
import { ListGamesUseCase, GetGameUseCase } from "@/application/catalog/list-games";
import { ListMatchesUseCase, GetMatchUseCase } from "@/application/catalog/list-matches";
import { ListMarketsUseCase, GetMarketUseCase } from "@/application/catalog/list-markets";
import { ListStreamersUseCase, GetStreamerUseCase } from "@/application/catalog/list-streamers";
import { GetMarketBookUseCase } from "@/application/catalog/get-market-book";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("catalog read use-cases (T-410, T-411)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const audit = new DrizzleAuditWriter();

  const games = (tx: DbTx) => new DrizzleGameRepository(tx);
  const matches = (tx: DbTx) => new DrizzleMatchRepository(tx);
  const markets = (tx: DbTx) => new DrizzleMarketRepository(tx);
  const streamers = (tx: DbTx) => new DrizzleStreamerRepository(tx);
  const outcomes = (tx: DbTx) => new DrizzleOutcomeRepository(tx);

  const createGame = new CreateGameUseCase<DbTx>({ uow, games, ids, audit });
  const createTournament = new CreateTournamentUseCase<DbTx>({
    uow,
    games,
    tournaments: (tx) => new DrizzleTournamentRepository(tx),
    ids,
    audit,
  });
  const createMatch = new CreateMatchUseCase<DbTx>({
    uow,
    tournaments: (tx) => new DrizzleTournamentRepository(tx),
    matches,
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
    streamers,
    ids,
    audit,
  });
  const createMarket = new CreateMarketUseCase<DbTx>({
    uow,
    matches,
    marketTypes: (tx) => new DrizzleMarketTypeRepository(tx),
    streamers,
    economicProfiles: (tx) => new DrizzleEconomicProfileRepository(tx),
    markets,
    outcomes,
    ids,
    audit,
  });

  const listGames = new ListGamesUseCase<DbTx>({ uow, games });
  const getGame = new GetGameUseCase<DbTx>({ uow, games });
  const listMatches = new ListMatchesUseCase<DbTx>({ uow, matches });
  const getMatch = new GetMatchUseCase<DbTx>({ uow, matches });
  const listMarkets = new ListMarketsUseCase<DbTx>({ uow, markets });
  const getMarket = new GetMarketUseCase<DbTx>({ uow, markets });
  const listStreamers = new ListStreamersUseCase<DbTx>({ uow, streamers });
  const getStreamer = new GetStreamerUseCase<DbTx>({ uow, streamers });
  const getMarketBook = new GetMarketBookUseCase<DbTx>({ uow, markets, outcomes });

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
    marketId: string;
    streamerId: string;
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
    const market = await createMarket.execute({
      actorId,
      matchId: match.id,
      marketTypeId: marketType.id,
      streamerId: streamer.id,
      economicProfileId: profile.id,
      closesAt: new Date(Date.now() + 3600_000),
      outcomes: [
        { code: "TEAM_A", label: "Team A" },
        { code: "TEAM_B", label: "Team B" },
      ],
    });

    return { matchId: match.id, marketId: market.id, streamerId: streamer.id };
  }

  it("lists and gets games, matches, markets and streamers", async () => {
    const actorId = await createAdmin();
    const fx = await createFixtures(actorId);

    const gamesPage = await listGames.execute({});
    expect(gamesPage.total).toBeGreaterThanOrEqual(1);
    expect(gamesPage.limit).toBe(20);

    const matchesPage = await listMatches.execute({});
    expect(matchesPage.items.some((m) => m.id === fx.matchId)).toBe(true);

    const marketsPage = await listMarkets.execute({});
    expect(marketsPage.items.some((m) => m.id === fx.marketId)).toBe(true);

    const streamersPage = await listStreamers.execute({});
    expect(streamersPage.items.some((s) => s.id === fx.streamerId)).toBe(true);

    const match = await getMatch.execute({ id: fx.matchId });
    expect(match.id).toBe(fx.matchId);

    const market = await getMarket.execute({ id: fx.marketId });
    expect(market.id).toBe(fx.marketId);
    expect(market.status).toBe("DRAFT");

    const streamer = await getStreamer.execute({ id: fx.streamerId });
    expect(streamer.id).toBe(fx.streamerId);
  });

  it("clamps limit to the hard maximum page size (RULE-G04)", async () => {
    const page = await listGames.execute({ limit: 10_000 });
    expect(page.limit).toBe(50);
    expect(page.items.length).toBeLessThanOrEqual(50);
  });

  it("throws RESOURCE_NOT_FOUND for an unknown game id", async () => {
    await expect(getGame.execute({ id: randomUUID() })).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it("returns aggregate-only per-outcome liquidity for the market book", async () => {
    const actorId = await createAdmin();
    const fx = await createFixtures(actorId);

    const book = await getMarketBook.execute({ marketId: fx.marketId });
    expect(book.marketId).toBe(fx.marketId);
    expect(book.outcomes).toHaveLength(2);
    for (const outcome of book.outcomes) {
      expect(outcome).not.toHaveProperty("userId");
      expect(outcome).not.toHaveProperty("orderId");
      expect(outcome.unmatchedStake).toBe("0");
    }
  });

  it("throws RESOURCE_NOT_FOUND for a market book on an unknown market", async () => {
    await expect(getMarketBook.execute({ marketId: randomUUID() })).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });
});
