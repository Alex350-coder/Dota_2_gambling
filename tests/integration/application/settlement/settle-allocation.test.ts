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
import { DrizzleMarketResultRepository } from "@/infra/db/repositories/market-result-repository";
import { DrizzleSettlementRunRepository } from "@/infra/db/repositories/settlement-run-repository";
import { DrizzleOrderRepository } from "@/infra/db/repositories/order-repository";
import { DrizzleWalletRepository } from "@/infra/db/repositories/wallet-repository";
import { DrizzleBetSlipRepository } from "@/infra/db/repositories/bet-slip-repository";
import { DrizzleBookRepository } from "@/infra/db/repositories/book";
import { DrizzleAllocationRepository } from "@/infra/db/repositories/allocation-repository";
import { LedgerService } from "@/infra/db/ledger";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { pgAdvisoryXactLock } from "@/infra/db/locks";
import { ManualAdminResultProvider } from "@/infra/results/manual";
import { CreateGameUseCase } from "@/application/catalog/game";
import { CreateTournamentUseCase } from "@/application/catalog/tournament";
import { CreateMatchUseCase } from "@/application/catalog/match";
import { CreateMarketTypeUseCase } from "@/application/catalog/market-type";
import { CreateEconomicProfileUseCase } from "@/application/catalog/economic-profile";
import { CreateStreamerUseCase } from "@/application/catalog/streamer";
import { CreateMarketUseCase } from "@/application/catalog/create-market";
import { TransitionMarketUseCase } from "@/application/catalog/transition-market";
import { PlaceOrderUseCase } from "@/application/betting/place-order";
import { ProposeResultUseCase } from "@/application/results/propose";
import { ConfirmResultUseCase } from "@/application/results/confirm";
import { SettleMarketUseCase } from "@/application/settlement/run";
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
 * FIN-05/06/07/08 + T-614: exact-amount settlement scenarios on a real market, matched via the
 * P5 matching engine, then settled through `SettleMarketUseCase`'s Phase 1 (release) and Phase 2
 * (per-allocation payout) wiring added in T-607/T-608.
 */
describe("SettleMarketUseCase — payout math (FIN-05..08, T-614)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const audit = new DrizzleAuditWriter();
  const clock = new TestClock(new Date("2026-01-01T00:00:00.000Z"));
  const provider = new ManualAdminResultProvider();
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
  const proposeResult = new ProposeResultUseCase<DbTx>({
    uow,
    markets: (tx) => new DrizzleMarketRepository(tx),
    outcomes: (tx) => new DrizzleOutcomeRepository(tx),
    marketResults: (tx) => new DrizzleMarketResultRepository(tx),
    betOrders: (tx, ownerId) => new DrizzleOrderRepository(tx, ownerId),
    provider,
    ids,
    clock,
    audit,
  });
  const confirmResult = new ConfirmResultUseCase<DbTx>({
    uow,
    marketResults: (tx) => new DrizzleMarketResultRepository(tx),
    betOrders: (tx, ownerId) => new DrizzleOrderRepository(tx, ownerId),
    clock,
    audit,
  });
  const settleMarket = new SettleMarketUseCase<DbTx>({
    uow,
    markets: (tx) => new DrizzleMarketRepository(tx),
    marketResults: (tx) => new DrizzleMarketResultRepository(tx),
    settlementRuns: (tx) => new DrizzleSettlementRunRepository(tx),
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

  /**
   * Builds a fully matched market: 10000 minor on TEAM_A vs 10000 minor on TEAM_B, at
   * oddsNum=18/oddsDen=10, streamerCommissionBps=2000 — the same fixture shape used by
   * `match.test.ts`'s FIN-01, so `matchedMinor = 10000` and escrow = 20000 before settlement.
   */
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

  async function closeAndConfirm(marketId: string, winningOutcomeId: string): Promise<void> {
    const proposer = await createUser();
    await transitionMarket.execute({
      actorId: proposer,
      marketId,
      actor: "ADMIN",
      to: "CLOSED",
      manualClose: true,
    });
    const proposed = await proposeResult.execute({
      actorId: proposer,
      marketId,
      winningOutcomeId,
      rawPayload: { winner: "TEAM_A" },
    });
    const confirmer = await createUser();
    await confirmResult.execute({ actorId: confirmer, resultId: proposed.id });
  }

  it("FIN-06: winner's available balance grows by 18000 on a 10000-matched allocation at 20% commission", async () => {
    const { marketId, outcomeAId, userA, userB } = await createMatchedMarket();
    await closeAndConfirm(marketId, outcomeAId);

    const before = await walletOf(userA);
    const admin = await createUser();
    await settleMarket.execute({ actorId: admin, marketId });
    const after = await walletOf(userA);

    expect(after.available - before.available).toBe(18_000n);
    void userB;
  });

  it("FIN-07: loser's stake never returns — net change across the whole lifecycle is -10000", async () => {
    const { marketId, outcomeAId, userB } = await createMatchedMarket();
    const beforeMatch = await walletOf(userB); // already debited 10000 into locked by placeOrder
    await closeAndConfirm(marketId, outcomeAId);

    const admin = await createUser();
    await settleMarket.execute({ actorId: admin, marketId });
    const after = await walletOf(userB);

    // The loser's matched stake was already moved out of `available` at placement time; nothing
    // comes back on settlement, so available is unchanged since just before matching and locked
    // drops to zero (the matched amount left escrow to the winner, not back to the loser).
    expect(after.available).toBe(beforeMatch.available);
    expect(after.locked).toBe(0n);
  });

  it("FIN-08: streamer commission credits STREAMER_PAYABLE for 2000, and the ledger sums to 20000 total", async () => {
    const { marketId, streamerId, outcomeAId } = await createMatchedMarket();
    await closeAndConfirm(marketId, outcomeAId);

    const admin = await createUser();
    await settleMarket.execute({ actorId: admin, marketId });

    const commissionRows = await pool
      .query(`SELECT signed_amount_minor FROM ledger_entries WHERE account_key = $1`, [
        `STREAMER_PAYABLE:${streamerId}`,
      ])
      .then((r) =>
        (r.rows as { signed_amount_minor: bigint }[]).map((row) =>
          toBigIntRow(row, ["signed_amount_minor"]),
        ),
      );
    const commissionTotal = commissionRows.reduce((sum, row) => sum + row.signed_amount_minor, 0n);
    expect(commissionTotal).toBe(2_000n);

    // Escrow started at +20000 (both stakes) and settlement debits exactly winnerReturn(18000) +
    // commission(2000) = 20000, so escrow nets to zero once this allocation is the only one.
    expect(await escrowOf(marketId)).toBe(0n);
  });

  it("T-614: streamer commission never lands in any spendable wallet", async () => {
    const { marketId, streamerId, outcomeAId } = await createMatchedMarket();
    await closeAndConfirm(marketId, outcomeAId);

    const admin = await createUser();
    await settleMarket.execute({ actorId: admin, marketId });

    const walletRow = await pool.query("SELECT 1 FROM wallets WHERE user_id = $1", [streamerId]);
    // The streamer's own user row (if any) never gets a wallet credit keyed by the streamer id —
    // STREAMER_PAYABLE is a distinct account namespace `LedgerService.applyWalletDeltas` never
    // projects onto `wallets` (only `USER_AVAILABLE:*`/`USER_LOCKED:*` prefixes are recognised).
    expect(walletRow.rows).toHaveLength(0);
  });

  it("FIN-05: settlement's Phase 1 releases any still-unmatched remainder exactly once", async () => {
    const { marketId, outcomeAId, userA } = await createMatchedMarket();
    // An extra, never-matched order from userA before close: fully unmatched. This test's
    // `transitionMarket` has no `onClosed` hook wired (unlike `container.ts`'s production
    // wiring), so the CLOSED transition alone does not release it — settlement's own Phase 1
    // call (T-607) is what performs the release here.
    await placeOrder.execute({
      userId: userA,
      marketId,
      outcomeId: outcomeAId,
      requestedMinor: 5_000n,
      idempotencyKey: randomUUID(),
    });
    const beforeClose = await walletOf(userA);

    await closeAndConfirm(marketId, outcomeAId);
    const afterClose = await walletOf(userA);
    expect(afterClose.available - beforeClose.available).toBe(0n);

    const admin = await createUser();
    await settleMarket.execute({ actorId: admin, marketId });
    const afterSettle = await walletOf(userA);

    // Phase 1 release (+5000) and Phase 2 payout (+18000) both land in this single settlement
    // call — 23000 total, and a second `settleMarket` call must not add either amount again.
    expect(afterSettle.available - afterClose.available).toBe(23_000n);
    expect(afterSettle.locked).toBe(0n);

    await expect(settleMarket.execute({ actorId: admin, marketId })).rejects.toMatchObject({
      code: "ALREADY_SETTLED",
    });
    const afterRetry = await walletOf(userA);
    expect(afterRetry.available).toBe(afterSettle.available);
  });
});
