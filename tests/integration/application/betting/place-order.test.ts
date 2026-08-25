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
import { LedgerService } from "@/infra/db/ledger";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { CreateGameUseCase } from "@/application/catalog/game";
import { CreateTournamentUseCase } from "@/application/catalog/tournament";
import { CreateMatchUseCase } from "@/application/catalog/match";
import { CreateMarketTypeUseCase } from "@/application/catalog/market-type";
import { CreateEconomicProfileUseCase } from "@/application/catalog/economic-profile";
import { CreateStreamerUseCase } from "@/application/catalog/streamer";
import { CreateMarketUseCase } from "@/application/catalog/create-market";
import { TransitionMarketUseCase } from "@/application/catalog/transition-market";
import { PlaceOrderUseCase } from "@/application/betting/place-order";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

class TestClock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  set(date: Date): void {
    this.current = date;
  }
}

describe("PlaceOrderUseCase", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const audit = new DrizzleAuditWriter();
  const clock = new TestClock(new Date("2026-01-01T00:00:00.000Z"));
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
    users: (tx) => new DrizzleUserRepository(tx),
    wallets: (tx, ownerId) => new DrizzleWalletRepository(tx, ownerId),
    betSlips: (tx, ownerId) => new DrizzleBetSlipRepository(tx, ownerId),
    betOrders: (tx, ownerId) => new DrizzleOrderRepository(tx, ownerId),
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

  async function createOpenMarket(): Promise<{ marketId: string; outcomeId: string }> {
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

    clock.set(new Date("2026-01-01T00:00:00.000Z"));
    const market = await createMarket.execute({
      actorId,
      matchId: match.id,
      marketTypeId: marketType.id,
      streamerId: streamer.id,
      economicProfileId: profile.id,
      closesAt: new Date("2026-01-02T00:00:00.000Z"),
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
      .query("SELECT id FROM outcomes WHERE market_id = $1 AND code = 'TEAM_A'", [market.id])
      .then((r) => r.rows as { id: string }[]);

    const outcome = outcomes[0];
    if (!outcome) throw new Error("outcome fixture missing");
    return { marketId: market.id, outcomeId: outcome.id };
  }

  it("reserves the stake, opens the order, and records exactly one BET_PLACED event", async () => {
    const { marketId, outcomeId } = await createOpenMarket();
    const userId = await createUser(50_000n);

    const order = await placeOrder.execute({
      userId,
      marketId,
      outcomeId,
      requestedMinor: 1_000n,
      idempotencyKey: randomUUID(),
    });

    expect(order.status).toBe("OPEN");
    expect(order.unmatchedMinor).toBe(1_000n);
    expect(order.matchedMinor).toBe(0n);

    const wallet = await pool
      .query("SELECT available_minor, locked_minor FROM wallets WHERE user_id = $1", [userId])
      .then((r) => r.rows[0] as { available_minor: bigint; locked_minor: bigint });
    expect(wallet.available_minor).toBe(49_000n);
    expect(wallet.locked_minor).toBe(1_000n);

    const auditRows = await pool
      .query("SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'BET_PLACED'", [
        order.id,
      ])
      .then((r) => r.rows);
    expect(auditRows).toHaveLength(1);
  });

  it("rejects a stake below the market minimum without reserving funds", async () => {
    const { marketId, outcomeId } = await createOpenMarket();
    const userId = await createUser(50_000n);

    await expect(
      placeOrder.execute({
        userId,
        marketId,
        outcomeId,
        requestedMinor: 1n,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "STAKE_BELOW_MINIMUM" });

    const wallet = await pool
      .query("SELECT available_minor FROM wallets WHERE user_id = $1", [userId])
      .then((r) => r.rows[0] as { available_minor: bigint });
    expect(wallet.available_minor).toBe(50_000n);
  });

  it("rejects insufficient funds without leaving a ledger transaction or order behind", async () => {
    const { marketId, outcomeId } = await createOpenMarket();
    const userId = await createUser(500n);

    await expect(
      placeOrder.execute({
        userId,
        marketId,
        outcomeId,
        requestedMinor: 1_000n,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });

    const orders = await pool
      .query("SELECT id FROM bet_orders WHERE user_id = $1", [userId])
      .then((r) => r.rows);
    expect(orders).toHaveLength(0);

    const wallet = await pool
      .query("SELECT available_minor, locked_minor FROM wallets WHERE user_id = $1", [userId])
      .then((r) => r.rows[0] as { available_minor: bigint; locked_minor: bigint });
    expect(wallet.available_minor).toBe(500n);
    expect(wallet.locked_minor).toBe(0n);
  });

  it("rejects an outcome that does not belong to the market", async () => {
    const { marketId } = await createOpenMarket();
    const userId = await createUser();

    await expect(
      placeOrder.execute({
        userId,
        marketId,
        outcomeId: randomUUID(),
        requestedMinor: 1_000n,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "INVALID_OUTCOME" });
  });

  it("rejects placement against a non-existent market", async () => {
    const { outcomeId } = await createOpenMarket();
    const userId = await createUser();

    await expect(
      placeOrder.execute({
        userId,
        marketId: randomUUID(),
        outcomeId,
        requestedMinor: 1_000n,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("rejects placement on a DRAFT market that has never been opened", async () => {
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
      closesAt: new Date("2026-01-02T00:00:00.000Z"),
      outcomes: [
        { code: "TEAM_A", label: "Team A" },
        { code: "TEAM_B", label: "Team B" },
      ],
    });
    const outcomes = await pool
      .query("SELECT id FROM outcomes WHERE market_id = $1 AND code = 'TEAM_A'", [market.id])
      .then((r) => r.rows as { id: string }[]);
    const outcome = outcomes[0];
    if (!outcome) throw new Error("outcome fixture missing");
    const userId = await createUser();

    await expect(
      placeOrder.execute({
        userId,
        marketId: market.id,
        outcomeId: outcome.id,
        requestedMinor: 1_000n,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "MARKET_CLOSED" });
  });

  it("rejects placement for a suspended account", async () => {
    const { marketId, outcomeId } = await createOpenMarket();
    const userId = await createUser();
    await pool.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [userId]);

    await expect(
      placeOrder.execute({
        userId,
        marketId,
        outcomeId,
        requestedMinor: 1_000n,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_SUSPENDED" });
  });
});
