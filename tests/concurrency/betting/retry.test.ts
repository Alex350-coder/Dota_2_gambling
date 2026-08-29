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
import { DrizzleWalletRepository } from "@/infra/db/repositories/wallet-repository";
import { DrizzleBetSlipRepository } from "@/infra/db/repositories/bet-slip-repository";
import { DrizzleOrderRepository } from "@/infra/db/repositories/order-repository";
import { DrizzleBookRepository } from "@/infra/db/repositories/book";
import { DrizzleAllocationRepository } from "@/infra/db/repositories/allocation-repository";
import { LedgerService } from "@/infra/db/ledger";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { pgAdvisoryXactLock } from "@/infra/db/locks";
import { CreateGameUseCase } from "@/application/catalog/game";
import { CreateTournamentUseCase } from "@/application/catalog/tournament";
import { CreateMatchUseCase } from "@/application/catalog/match";
import { CreateMarketTypeUseCase } from "@/application/catalog/market-type";
import { CreateEconomicProfileUseCase } from "@/application/catalog/economic-profile";
import { CreateStreamerUseCase } from "@/application/catalog/streamer";
import { CreateMarketUseCase } from "@/application/catalog/create-market";
import { TransitionMarketUseCase } from "@/application/catalog/transition-market";
import { PlaceOrderUseCase } from "@/application/betting/place-order";
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";
import { toBigIntRow } from "../../helpers/pg-bigint";

class SystemClock {
  now(): Date {
    return new Date();
  }
}

/**
 * CC-07: two placements racing on the same market's advisory lock (T-505) must never
 * surface a deadlock/serialization error to the caller — `DrizzleUnitOfWork.run`'s retry
 * (T-515) absorbs SQLSTATE 40P01/40001 transparently. Both concurrent placements are
 * expected to eventually resolve, and the resulting ledger/allocation state must reflect
 * no double-spend and no lost update regardless of which one the DB serialized first.
 */
describe("PlaceOrderUseCase concurrency (CC-07)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const audit = new DrizzleAuditWriter();
  const clock = new SystemClock();
  const ledger = new LedgerService(ids, clock);

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
  const transitionMarket = new TransitionMarketUseCase<DbTx>({
    uow,
    markets: (tx) => new DrizzleMarketRepository(tx),
    outcomes: (tx) => new DrizzleOutcomeRepository(tx),
    clock,
    audit,
  });

  const placeOrder = new PlaceOrderUseCase<DbTx>({
    uow,
    markets: (tx) => new DrizzleMarketRepository(tx),
    outcomes: (tx) => new DrizzleOutcomeRepository(tx),
    economicProfiles: (tx) => new DrizzleEconomicProfileRepository(tx),
    streamers: (tx) => new DrizzleStreamerRepository(tx),
    users: (tx) => new DrizzleUserRepository(tx),
    wallets: (tx, ownerId) => new DrizzleWalletRepository(tx, ownerId),
    betSlips: (tx, ownerId) => new DrizzleBetSlipRepository(tx, ownerId),
    betOrders: (tx, ownerId) => new DrizzleOrderRepository(tx, ownerId),
    book: (tx) => new DrizzleBookRepository(tx),
    allocations: (tx) => new DrizzleAllocationRepository(tx, ""),
    acquireMarketLock: (tx, marketId) => pgAdvisoryXactLock(tx, `market:${marketId}`),
    ledger,
    ids,
    clock,
    audit,
  });

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createUser(availableMinor = 100_000n): Promise<string> {
    const userId = ids.next();
    await pool.query(
      "INSERT INTO users (id, email, status, date_of_birth) VALUES ($1, $2, 'ACTIVE', '1990-01-01')",
      [userId, `bettor-${randomUUID()}@example.test`],
    );
    await pool.query(
      "INSERT INTO wallets (user_id, currency, available_minor, locked_minor) VALUES ($1, 'PEN', $2, 0)",
      [userId, availableMinor],
    );
    return userId;
  }

  async function createOpenMarket(): Promise<{
    marketId: string;
    outcomeAId: string;
    outcomeBId: string;
  }> {
    const actorId = await createUser();
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
    const streamerUserId = await createUser();
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
      closesAt: new Date(Date.now() + 60 * 60 * 1000),
      outcomes: [
        { code: "TEAM_A", label: "Team A" },
        { code: "TEAM_B", label: "Team B" },
      ],
    });
    const opened = await transitionMarket.execute({
      actorId,
      marketId: market.id,
      actor: "ADMIN",
      to: "OPEN",
    });
    expect(opened.status).toBe("OPEN");

    const outcomes = await pool
      .query("SELECT id, code FROM outcomes WHERE market_id = $1", [market.id])
      .then((r) => r.rows as { id: string; code: string }[]);
    const outcomeA = outcomes.find((row) => row.code === "TEAM_A");
    const outcomeB = outcomes.find((row) => row.code === "TEAM_B");
    if (!outcomeA || !outcomeB) throw new Error("outcome fixture missing");

    return { marketId: market.id, outcomeAId: outcomeA.id, outcomeBId: outcomeB.id };
  }

  it("resolves both concurrent placements on the same market without a deadlock error escaping", async () => {
    const { marketId, outcomeAId, outcomeBId } = await createOpenMarket();
    const userA = await createUser();
    const userB = await createUser();

    const [orderA, orderB] = await Promise.all([
      placeOrder.execute({
        userId: userA,
        marketId,
        outcomeId: outcomeAId,
        requestedMinor: 5_000n,
        idempotencyKey: randomUUID(),
      }),
      placeOrder.execute({
        userId: userB,
        marketId,
        outcomeId: outcomeBId,
        requestedMinor: 5_000n,
        idempotencyKey: randomUUID(),
      }),
    ]);

    expect(orderA.matchedMinor + orderA.unmatchedMinor).toBe(5_000n);
    expect(orderB.matchedMinor + orderB.unmatchedMinor).toBe(5_000n);

    const allocations = await pool
      .query("SELECT matched_minor FROM match_allocations WHERE market_id = $1", [marketId])
      .then((r) =>
        (r.rows as { matched_minor: bigint }[]).map((row) => toBigIntRow(row, ["matched_minor"])),
      );
    const totalMatched = allocations.reduce((sum, row) => sum + row.matched_minor, 0n);
    expect(totalMatched).toBeLessThanOrEqual(5_000n);
  });

  it("never leaves a negative available balance across many concurrent racing placements", async () => {
    const { marketId, outcomeAId, outcomeBId } = await createOpenMarket();
    const users = await Promise.all(Array.from({ length: 10 }, () => createUser(2_000n)));

    const results = await Promise.allSettled(
      users.map((userId, index) =>
        placeOrder.execute({
          userId,
          marketId,
          outcomeId: index % 2 === 0 ? outcomeAId : outcomeBId,
          requestedMinor: 1_000n,
          idempotencyKey: randomUUID(),
        }),
      ),
    );

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);

    const wallets = await pool
      .query("SELECT available_minor FROM wallets WHERE user_id = ANY($1::uuid[])", [users])
      .then((r) =>
        (r.rows as { available_minor: bigint }[]).map((row) =>
          toBigIntRow(row, ["available_minor"]),
        ),
      );
    expect(wallets.every((wallet) => wallet.available_minor >= 0n)).toBe(true);
  });
});
