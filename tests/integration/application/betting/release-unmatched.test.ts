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
import { releaseUnmatchedOnClose } from "@/application/betting/release-unmatched";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";
import { toBigIntRow } from "../../../helpers/pg-bigint";

class TestClock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  set(date: Date): void {
    this.current = date;
  }
}

describe("releaseUnmatchedOnClose", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const audit = new DrizzleAuditWriter();
  const clock = new TestClock(new Date("2026-01-01T00:00:00.000Z"));
  const ledger = new LedgerService(ids, clock);

  const markets = (tx: DbTx) => new DrizzleMarketRepository(tx);
  const economicProfiles = (tx: DbTx) => new DrizzleEconomicProfileRepository(tx);
  const outcomes = (tx: DbTx) => new DrizzleOutcomeRepository(tx);
  const book = (tx: DbTx) => new DrizzleBookRepository(tx);
  const betOrders = (tx: DbTx, ownerId: string) => new DrizzleOrderRepository(tx, ownerId);

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
    economicProfiles,
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
    economicProfiles,
    markets,
    outcomes,
    ids,
    audit,
  });
  const transitionMarket = new TransitionMarketUseCase<DbTx>({
    uow,
    markets,
    outcomes,
    clock,
    audit,
    onClosed: (tx, market) =>
      releaseUnmatchedOnClose(
        tx,
        { book, betOrders, economicProfiles, ledger, ids, clock },
        market,
      ),
  });
  const placeOrder = new PlaceOrderUseCase<DbTx>({
    uow,
    markets,
    outcomes,
    economicProfiles,
    streamers: (tx) => new DrizzleStreamerRepository(tx),
    users: (tx) => new DrizzleUserRepository(tx),
    wallets: (tx, ownerId) => new DrizzleWalletRepository(tx, ownerId),
    betSlips: (tx, ownerId) => new DrizzleBetSlipRepository(tx, ownerId),
    betOrders,
    book,
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

    const outcomeRows = await pool
      .query("SELECT id, code FROM outcomes WHERE market_id = $1", [market.id])
      .then((r) => r.rows as { id: string; code: string }[]);
    const outcomeA = outcomeRows.find((row) => row.code === "TEAM_A");
    const outcomeB = outcomeRows.find((row) => row.code === "TEAM_B");
    if (!outcomeA || !outcomeB) throw new Error("outcome fixture missing");

    return { marketId: market.id, outcomeAId: outcomeA.id, outcomeBId: outcomeB.id };
  }

  it("FIN-05: releases the unmatched remainder back to available when the market closes", async () => {
    const { marketId, outcomeAId } = await createOpenMarket();
    const userId = await createUser();

    const order = await placeOrder.execute({
      userId,
      marketId,
      outcomeId: outcomeAId,
      requestedMinor: 5_000n,
      idempotencyKey: randomUUID(),
    });
    expect(order.unmatchedMinor).toBe(5_000n);

    const closed = await transitionMarket.execute({
      actorId: userId,
      marketId,
      actor: "ADMIN",
      to: "SUSPENDED",
    });
    expect(closed.status).toBe("SUSPENDED");
    await transitionMarket.execute({
      actorId: userId,
      marketId,
      actor: "ADMIN",
      to: "CLOSED",
      manualClose: true,
    });

    const orderRow = await pool
      .query(
        "SELECT status, matched_minor, unmatched_minor, released_minor FROM bet_orders WHERE id = $1",
        [order.id],
      )
      .then((r) =>
        toBigIntRow(
          r.rows[0] as {
            status: string;
            matched_minor: bigint;
            unmatched_minor: bigint;
            released_minor: bigint;
          },
          ["matched_minor", "unmatched_minor", "released_minor"],
        ),
      );
    expect(orderRow.status).toBe("CANCELLED");
    expect(orderRow.unmatched_minor).toBe(0n);
    expect(orderRow.released_minor).toBe(5_000n);

    const wallet = await pool
      .query("SELECT available_minor, locked_minor FROM wallets WHERE user_id = $1", [userId])
      .then((r) =>
        toBigIntRow(r.rows[0] as { available_minor: bigint; locked_minor: bigint }, [
          "available_minor",
          "locked_minor",
        ]),
      );
    expect(wallet.available_minor).toBe(100_000n);
    expect(wallet.locked_minor).toBe(0n);
  });

  it("only releases the unmatched remainder of a partially-matched order, leaving the matched portion untouched", async () => {
    const { marketId, outcomeAId, outcomeBId } = await createOpenMarket();
    const userA = await createUser();
    const userB = await createUser();

    const resting = await placeOrder.execute({
      userId: userA,
      marketId,
      outcomeId: outcomeAId,
      requestedMinor: 3_000n,
      idempotencyKey: randomUUID(),
    });
    const incoming = await placeOrder.execute({
      userId: userB,
      marketId,
      outcomeId: outcomeBId,
      requestedMinor: 10_000n,
      idempotencyKey: randomUUID(),
    });
    expect(incoming.matchedMinor).toBe(3_000n);
    expect(incoming.unmatchedMinor).toBe(7_000n);

    await transitionMarket.execute({
      actorId: userA,
      marketId,
      actor: "ADMIN",
      to: "SUSPENDED",
    });
    await transitionMarket.execute({
      actorId: userA,
      marketId,
      actor: "ADMIN",
      to: "CLOSED",
      manualClose: true,
    });

    const restingRow = await pool
      .query("SELECT status, matched_minor, unmatched_minor FROM bet_orders WHERE id = $1", [
        resting.id,
      ])
      .then((r) =>
        toBigIntRow(
          r.rows[0] as { status: string; matched_minor: bigint; unmatched_minor: bigint },
          ["matched_minor", "unmatched_minor"],
        ),
      );
    expect(restingRow.status).toBe("MATCHED");
    expect(restingRow.unmatched_minor).toBe(0n);

    const incomingRow = await pool
      .query(
        "SELECT status, matched_minor, unmatched_minor, released_minor FROM bet_orders WHERE id = $1",
        [incoming.id],
      )
      .then((r) =>
        toBigIntRow(
          r.rows[0] as {
            status: string;
            matched_minor: bigint;
            unmatched_minor: bigint;
            released_minor: bigint;
          },
          ["matched_minor", "unmatched_minor", "released_minor"],
        ),
      );
    expect(incomingRow.status).toBe("CANCELLED");
    expect(incomingRow.matched_minor).toBe(3_000n);
    expect(incomingRow.unmatched_minor).toBe(0n);
    expect(incomingRow.released_minor).toBe(7_000n);

    const walletB = await pool
      .query("SELECT available_minor, locked_minor FROM wallets WHERE user_id = $1", [userB])
      .then((r) =>
        toBigIntRow(r.rows[0] as { available_minor: bigint; locked_minor: bigint }, [
          "available_minor",
          "locked_minor",
        ]),
      );
    expect(walletB.available_minor).toBe(97_000n);
    expect(walletB.locked_minor).toBe(3_000n);
  });

  it("is a no-op when there are no open orders left on the market", async () => {
    const { marketId } = await createOpenMarket();
    const userId = await createUser();

    const closed = await transitionMarket.execute({
      actorId: userId,
      marketId,
      actor: "ADMIN",
      to: "SUSPENDED",
    });
    expect(closed.status).toBe("SUSPENDED");

    await expect(
      transitionMarket.execute({
        actorId: userId,
        marketId,
        actor: "ADMIN",
        to: "CLOSED",
        manualClose: true,
      }),
    ).resolves.toMatchObject({ status: "CLOSED" });
  });
});
