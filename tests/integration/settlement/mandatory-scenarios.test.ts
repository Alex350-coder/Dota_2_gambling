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
import { runAllReconcileChecks } from "@/infra/db/reconcile-queries";
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
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";

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
 * Mandatory scenarios not already exercised by earlier commits' integration tests (T-615):
 * FIN-09 (duplicate settlement no-op), FIN-17 (`pnpm reconcile` clean after a full lifecycle),
 * FIN-18 (negative-balance CHECK-first rejection), FIN-20 (unauthorized settlement — the 409
 * "admin without confirmed result" half; the 403 non-admin half is already covered by
 * `admin-settlement-routes.test.ts`'s MET-COV-04 block), and CC-04 (concurrent settlement,
 * ≥50 iterations, real Postgres).
 */
describe("settlement mandatory scenarios (T-615)", () => {
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

  /**
   * Wallet funding is backed by a real FAUCET ledger transaction (not a bare wallet UPDATE) so
   * that FIN-17's reconcile pass has a consistent ledger to check against — INV-03 requires
   * `wallets.available_minor` to equal `balance(USER_AVAILABLE:u)`.
   */
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
    if (availableMinor > 0n) {
      const txResult = await pool.query(
        `INSERT INTO ledger_transactions
           (kind, reference_type, reference_id, idempotency_key, actor_type, actor_id)
         VALUES ('FAUCET', 'bet_order', $1, $2, 'SYSTEM', NULL)
         RETURNING id`,
        [randomUUID(), `faucet-${userId}`],
      );
      const transactionId = (txResult.rows[0] as { id: string }).id;
      await pool.query(
        `INSERT INTO ledger_entries (transaction_id, account_key, currency, signed_amount_minor)
         VALUES ($1, $2, 'PEN', $3), ($1, 'SIMULATION_FAUCET', 'PEN', $4)`,
        [transactionId, `USER_AVAILABLE:${userId}`, availableMinor, -availableMinor],
      );
    }
    return userId;
  }

  /** Same fixture shape as `settle-allocation.test.ts`'s FIN-06..08: 10000-vs-10000, 20% commission. */
  async function createMatchedMarket(): Promise<{
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

    return { marketId: market.id, outcomeAId: outcomeA.id, outcomeBId: outcomeB.id };
  }

  async function closeMarket(marketId: string): Promise<void> {
    const actor = await createUser();
    await transitionMarket.execute({
      actorId: actor,
      marketId,
      actor: "ADMIN",
      to: "CLOSED",
      manualClose: true,
    });
  }

  async function closeAndConfirm(marketId: string, winningOutcomeId: string): Promise<void> {
    const proposer = await createUser();
    await closeMarket(marketId);
    const proposed = await proposeResult.execute({
      actorId: proposer,
      marketId,
      winningOutcomeId,
      rawPayload: { winner: "TEAM_A" },
    });
    const confirmer = await createUser();
    await confirmResult.execute({ actorId: confirmer, resultId: proposed.id });
  }

  async function ledgerEntryCount(marketId: string): Promise<number> {
    const result = await pool.query(
      `SELECT count(*)::int AS count FROM ledger_entries WHERE account_key = $1`,
      [`MARKET_ESCROW:${marketId}`],
    );
    return (result.rows[0] as { count: number }).count;
  }

  it("FIN-09: a duplicate settlement call is a no-op — ALREADY_SETTLED, zero new ledger rows", async () => {
    const admin = await createUser();
    const { marketId, outcomeAId } = await createMatchedMarket();
    await closeAndConfirm(marketId, outcomeAId);

    const firstRun = await settleMarket.execute({ actorId: admin, marketId });
    expect(firstRun.status).toBe("COMPLETED");
    const entriesAfterFirst = await ledgerEntryCount(marketId);

    await expect(settleMarket.execute({ actorId: admin, marketId })).rejects.toMatchObject({
      code: "ALREADY_SETTLED",
    });
    const entriesAfterSecond = await ledgerEntryCount(marketId);
    expect(entriesAfterSecond).toBe(entriesAfterFirst);
  });

  it("FIN-17: reconcile is clean (all invariants PASS) after a full place -> match -> settle lifecycle", async () => {
    const admin = await createUser();
    const { marketId, outcomeAId } = await createMatchedMarket();
    await closeAndConfirm(marketId, outcomeAId);
    const run = await settleMarket.execute({ actorId: admin, marketId });
    expect(run.status).toBe("COMPLETED");

    const client = await pool.connect();
    try {
      const results = await runAllReconcileChecks(client);
      const failures = results.filter((result) => result.status === "FAIL");
      expect(failures).toEqual([]);
    } finally {
      client.release();
    }
  });

  it("FIN-18: a direct negative-balance UPDATE violates the wallet CHECK constraint", async () => {
    const userId = await createUser(500n);

    await expect(
      pool.query(`UPDATE wallets SET available_minor = available_minor - 1000 WHERE user_id = $1`, [
        userId,
      ]),
    ).rejects.toThrow(/chk_wallets_available_nonneg|violates check constraint/i);
  });

  it("FIN-18: PlaceOrderUseCase rejects an over-stake request before any wallet row could go negative", async () => {
    const { marketId, outcomeAId } = await createMatchedMarket();
    const poorUser = await createUser(500n);

    await expect(
      placeOrder.execute({
        userId: poorUser,
        marketId,
        outcomeId: outcomeAId,
        requestedMinor: 10_000n,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow();

    const wallet = await pool
      .query("SELECT available_minor FROM wallets WHERE user_id = $1", [poorUser])
      .then((r) => r.rows[0] as { available_minor: string });
    expect(BigInt(wallet.available_minor)).toBeGreaterThanOrEqual(0n);
  });

  it("FIN-20: settling a CLOSED market with no CONFIRMED result is rejected with 409 RESULT_NOT_CONFIRMED", async () => {
    const admin = await createUser();
    const { marketId } = await createMatchedMarket();
    await closeMarket(marketId);

    const error = await settleMarket
      .execute({ actorId: admin, marketId })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "RESULT_NOT_CONFIRMED", httpStatus: 409 });
  });

  it("CC-04: concurrent settlement attempts on one market never produce two COMPLETED runs (50 iterations)", async () => {
    const ITERATIONS = 50;
    for (let i = 0; i < ITERATIONS; i++) {
      const admin = await createUser();
      const { marketId, outcomeAId } = await createMatchedMarket();
      await closeAndConfirm(marketId, outcomeAId);

      const results = await Promise.allSettled([
        settleMarket.execute({ actorId: admin, marketId }),
        settleMarket.execute({ actorId: admin, marketId }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled).toHaveLength(1);
      expect((fulfilled[0] as PromiseFulfilledResult<{ status: string }>).value.status).toBe(
        "COMPLETED",
      );

      const completedRuns = await pool.query(
        `SELECT count(*)::int AS count FROM settlement_runs WHERE market_id = $1 AND status = 'COMPLETED'`,
        [marketId],
      );
      expect((completedRuns.rows[0] as { count: number }).count).toBe(1);
    }
  }, 120_000);
});
