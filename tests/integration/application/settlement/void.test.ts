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
import { DrizzleOrderRepository } from "@/infra/db/repositories/order-repository";
import { DrizzleWalletRepository } from "@/infra/db/repositories/wallet-repository";
import { DrizzleBetSlipRepository } from "@/infra/db/repositories/bet-slip-repository";
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
import { VoidMarketUseCase } from "@/application/settlement/void";
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

/**
 * `SETTLEMENT.md` §6, row 1 (T-610): a market voided as "match cancelled / not played" refunds
 * every matched allocation `m` to each side (no winner, no commission) and releases any
 * still-unmatched remainder, entirely bypassing `SETTLING`.
 */
describe("VoidMarketUseCase — refund path (SETTLEMENT.md §6, T-610)", () => {
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
  const voidMarket = new VoidMarketUseCase<DbTx>({
    uow,
    markets: (tx) => new DrizzleMarketRepository(tx),
    allocations: (tx) => new DrizzleAllocationRepository(tx, ""),
    book: (tx) => new DrizzleBookRepository(tx),
    betOrders: (tx, ownerId) => new DrizzleOrderRepository(tx, ownerId),
    economicProfiles: (tx) => new DrizzleEconomicProfileRepository(tx),
    ledger,
    acquireMarketLock: (tx, marketId) => pgAdvisoryXactLock(tx, `market:${marketId}`),
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

  async function walletOf(userId: string): Promise<{ available: bigint; locked: bigint }> {
    const row = await pool
      .query("SELECT available_minor, locked_minor FROM wallets WHERE user_id = $1", [userId])
      .then((r) =>
        toBigIntRow(r.rows[0] as { available_minor: bigint; locked_minor: bigint }, [
          "available_minor",
          "locked_minor",
        ]),
      );
    return { available: row.available_minor, locked: row.locked_minor };
  }

  async function escrowOf(marketId: string): Promise<bigint> {
    const rows = await pool
      .query(`SELECT signed_amount_minor FROM ledger_entries WHERE account_key = $1`, [
        `MARKET_ESCROW:${marketId}`,
      ])
      .then((r) =>
        (r.rows as { signed_amount_minor: bigint }[]).map((row) =>
          toBigIntRow(row, ["signed_amount_minor"]),
        ),
      );
    return rows.reduce((sum, row) => sum + row.signed_amount_minor, 0n);
  }

  /** Same fixture shape as `settle-allocation.test.ts`'s FIN-06..08: 10000-vs-10000, 20% commission. */
  async function createMatchedMarket(): Promise<{
    marketId: string;
    streamerId: string;
    outcomeAId: string;
    outcomeBId: string;
    userA: string;
    userB: string;
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
      closesAt: new Date("2026-01-02T00:00:00.000Z"),
      outcomes: [
        { code: "TEAM_A", label: "Team A" },
        { code: "TEAM_B", label: "Team B" },
      ],
    });
    await transitionMarket.execute({ actorId, marketId: market.id, actor: "ADMIN", to: "OPEN" });

    const outcomeRows = await pool
      .query("SELECT id, code FROM outcomes WHERE market_id = $1", [market.id])
      .then((r) => r.rows as { id: string; code: string }[]);
    const outcomeA = outcomeRows.find((row) => row.code === "TEAM_A");
    const outcomeB = outcomeRows.find((row) => row.code === "TEAM_B");
    if (!outcomeA || !outcomeB) throw new Error("outcome fixture missing");

    const userA = await createUser();
    const userB = await createUser();
    await placeOrder.execute({
      userId: userA,
      marketId: market.id,
      outcomeId: outcomeA.id,
      requestedMinor: 10_000n,
      idempotencyKey: randomUUID(),
    });
    await placeOrder.execute({
      userId: userB,
      marketId: market.id,
      outcomeId: outcomeB.id,
      requestedMinor: 10_000n,
      idempotencyKey: randomUUID(),
    });

    return {
      marketId: market.id,
      streamerId: streamer.id,
      outcomeAId: outcomeA.id,
      outcomeBId: outcomeB.id,
      userA,
      userB,
    };
  }

  async function closeMarket(actorId: string, marketId: string): Promise<void> {
    await transitionMarket.execute({
      actorId,
      marketId,
      actor: "ADMIN",
      to: "CLOSED",
      manualClose: true,
    });
  }

  it("refunds the exact matched amount to both sides — no winner, no commission", async () => {
    const { marketId, streamerId, userA, userB } = await createMatchedMarket();
    const beforeA = await walletOf(userA);
    const beforeB = await walletOf(userB);

    const admin = await createUser();
    await closeMarket(admin, marketId);
    const voided = await voidMarket.execute({ actorId: admin, marketId });

    const afterA = await walletOf(userA);
    const afterB = await walletOf(userB);

    expect(voided.status).toBe("VOID");
    expect(afterA.available - beforeA.available).toBe(10_000n);
    expect(afterB.available - beforeB.available).toBe(10_000n);
    expect(afterA.locked).toBe(0n);
    expect(afterB.locked).toBe(0n);

    // No commission: STREAMER_PAYABLE never receives an entry from a void refund.
    const commissionRows = await pool.query("SELECT 1 FROM ledger_entries WHERE account_key = $1", [
      `STREAMER_PAYABLE:${streamerId}`,
    ]);
    expect(commissionRows.rows).toHaveLength(0);

    expect(await escrowOf(marketId)).toBe(0n);
  });

  it("releases a still-unmatched remainder as part of the same void", async () => {
    const { marketId, outcomeAId, userA } = await createMatchedMarket();
    await placeOrder.execute({
      userId: userA,
      marketId,
      outcomeId: outcomeAId,
      requestedMinor: 5_000n,
      idempotencyKey: randomUUID(),
    });
    const before = await walletOf(userA);

    const admin = await createUser();
    await closeMarket(admin, marketId);
    await voidMarket.execute({ actorId: admin, marketId });
    const after = await walletOf(userA);

    // 10000 refund (matched) + 5000 release (never matched) = 15000.
    expect(after.available - before.available).toBe(15_000n);
    expect(after.locked).toBe(0n);
  });

  it("finalises orders to VOIDED and allocations to VOIDED", async () => {
    const { marketId, userA, userB } = await createMatchedMarket();

    const admin = await createUser();
    await closeMarket(admin, marketId);
    await voidMarket.execute({ actorId: admin, marketId });

    const orderRows = await pool
      .query("SELECT user_id, status FROM bet_orders WHERE market_id = $1", [marketId])
      .then((r) => r.rows as { user_id: string; status: string }[]);
    expect(orderRows).toHaveLength(2);
    for (const row of orderRows) {
      expect(row.status).toBe("VOIDED");
      expect([userA, userB]).toContain(row.user_id);
    }

    const allocationRows = await pool
      .query("SELECT status FROM match_allocations WHERE market_id = $1", [marketId])
      .then((r) => r.rows as { status: string }[]);
    expect(allocationRows).toHaveLength(1);
    expect(allocationRows[0]?.status).toBe("VOIDED");

    const marketRow = await pool
      .query("SELECT status FROM markets WHERE id = $1", [marketId])
      .then((r) => r.rows as { status: string }[]);
    expect(marketRow[0]?.status).toBe("VOID");
  });

  it("rejects voiding a market that is not SUSPENDED or CLOSED", async () => {
    const admin = await createUser();
    const { marketId } = await createMatchedMarket();
    // Market is still OPEN at this point (createMatchedMarket only opens it).

    await expect(voidMarket.execute({ actorId: admin, marketId })).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
    });
  });

  it("rejects re-voiding an already-VOID market", async () => {
    const admin = await createUser();
    const { marketId } = await createMatchedMarket();
    await closeMarket(admin, marketId);
    await voidMarket.execute({ actorId: admin, marketId });

    await expect(voidMarket.execute({ actorId: admin, marketId })).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
    });
  });
});
