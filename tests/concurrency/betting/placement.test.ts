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
import { CancelOrderUseCase } from "@/application/betting/cancel-order";
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";
import { toBigIntRow } from "../../helpers/pg-bigint";

class SystemClock {
  now(): Date {
    return new Date();
  }
}

const ITERATIONS = 50;

/**
 * CC-01, CC-02, CC-03 (T-516) — real Postgres, `Promise.all`/`Promise.allSettled` races
 * per iteration, `ITERATIONS` repeats to catch flaky interleavings (MET-T-04 = 0 failures).
 */
describe("PlaceOrderUseCase/CancelOrderUseCase concurrency (CC-01, CC-02, CC-03)", () => {
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

  const cancelOrder = new CancelOrderUseCase<DbTx>({
    uow,
    markets: (tx) => new DrizzleMarketRepository(tx),
    economicProfiles: (tx) => new DrizzleEconomicProfileRepository(tx),
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

  it("CC-01: exactly one of two racing placements succeeds against a single-order wallet", async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const { marketId, outcomeAId, outcomeBId } = await createOpenMarket();
      const userId = await createUser(5_000n);

      const results = await Promise.allSettled([
        placeOrder.execute({
          userId,
          marketId,
          outcomeId: outcomeAId,
          requestedMinor: 5_000n,
          idempotencyKey: randomUUID(),
        }),
        placeOrder.execute({
          userId,
          marketId,
          outcomeId: outcomeBId,
          requestedMinor: 5_000n,
          idempotencyKey: randomUUID(),
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled).toHaveLength(1);

      const wallet = await pool
        .query("SELECT available_minor, locked_minor FROM wallets WHERE user_id = $1", [userId])
        .then((r) =>
          toBigIntRow(r.rows[0] as { available_minor: bigint; locked_minor: bigint }, [
            "available_minor",
            "locked_minor",
          ]),
        );
      expect(wallet.available_minor).toBeGreaterThanOrEqual(0n);
      expect(wallet.available_minor + wallet.locked_minor).toBe(5_000n);
    }
  });

  it("CC-02: 10 concurrent orders against one resting counterparty never overmatch", async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const { marketId, outcomeAId, outcomeBId } = await createOpenMarket();
      const counterpartyId = await createUser(10_000n);

      const counterparty = await placeOrder.execute({
        userId: counterpartyId,
        marketId,
        outcomeId: outcomeAId,
        requestedMinor: 10_000n,
        idempotencyKey: randomUUID(),
      });

      const challengers = await Promise.all(Array.from({ length: 10 }, () => createUser(2_000n)));
      const results = await Promise.allSettled(
        challengers.map((userId) =>
          placeOrder.execute({
            userId,
            marketId,
            outcomeId: outcomeBId,
            requestedMinor: 2_000n,
            idempotencyKey: randomUUID(),
          }),
        ),
      );
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);

      const allocations = await pool
        .query("SELECT matched_minor FROM match_allocations WHERE market_id = $1", [marketId])
        .then((r) =>
          (r.rows as { matched_minor: bigint }[]).map((row) => toBigIntRow(row, ["matched_minor"])),
        );
      const totalMatched = allocations.reduce((sum, row) => sum + row.matched_minor, 0n);
      expect(totalMatched).toBe(counterparty.requestedMinor);

      const counterpartyRow = await pool
        .query("SELECT matched_minor, unmatched_minor FROM bet_orders WHERE id = $1", [
          counterparty.id,
        ])
        .then((r) =>
          toBigIntRow(r.rows[0] as { matched_minor: bigint; unmatched_minor: bigint }, [
            "matched_minor",
            "unmatched_minor",
          ]),
        );
      expect(counterpartyRow.matched_minor).toBe(totalMatched);
      expect(counterpartyRow.unmatched_minor).toBe(0n);
    }
  });

  it("CC-03: concurrent place + cancel always leaves requested = matched + unmatched + released", async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const { marketId, outcomeAId } = await createOpenMarket();
      const userId = await createUser(5_000n);

      const order = await placeOrder.execute({
        userId,
        marketId,
        outcomeId: outcomeAId,
        requestedMinor: 5_000n,
        idempotencyKey: randomUUID(),
      });

      const other = await createUser(5_000n);
      const outcomes = await pool
        .query("SELECT id, code FROM outcomes WHERE market_id = $1", [marketId])
        .then((r) => r.rows as { id: string; code: string }[]);
      const outcomeB = outcomes.find((row) => row.code !== "TEAM_A");
      if (!outcomeB) throw new Error("outcome fixture missing");

      const results = await Promise.allSettled([
        cancelOrder.execute({ actorId: userId, orderId: order.id }),
        placeOrder.execute({
          userId: other,
          marketId,
          outcomeId: outcomeB.id,
          requestedMinor: 5_000n,
          idempotencyKey: randomUUID(),
        }),
      ]);
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);

      const row = await pool
        .query(
          "SELECT requested_minor, matched_minor, unmatched_minor, released_minor FROM bet_orders WHERE id = $1",
          [order.id],
        )
        .then((r) =>
          toBigIntRow(
            r.rows[0] as {
              requested_minor: bigint;
              matched_minor: bigint;
              unmatched_minor: bigint;
              released_minor: bigint;
            },
            ["requested_minor", "matched_minor", "unmatched_minor", "released_minor"],
          ),
        );
      expect(row.matched_minor + row.unmatched_minor + row.released_minor).toBe(
        row.requested_minor,
      );
    }
  });
});
