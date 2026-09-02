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
import { DrizzleBookRepository } from "@/infra/db/repositories/book";
import { DrizzleAllocationRepository } from "@/infra/db/repositories/allocation-repository";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { LedgerService } from "@/infra/db/ledger";
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
import { ProposeResultUseCase } from "@/application/results/propose";
import { ConfirmResultUseCase } from "@/application/results/confirm";
import { SettleMarketUseCase } from "@/application/settlement/run";
import { sweepFailedSettlementRuns } from "@/application/settlement/sweeper";
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

describe("sweepFailedSettlementRuns", () => {
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
  const sweeperDeps = {
    uow,
    settlementRuns: (tx: DbTx) => new DrizzleSettlementRunRepository(tx),
    settleMarket,
    clock,
    audit,
  };

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createUser(): Promise<string> {
    const userId = ids.next();
    await pool.query(
      "INSERT INTO users (id, email, status, date_of_birth) VALUES ($1, $2, 'ACTIVE', '1990-01-01')",
      [userId, `user-${randomUUID()}@example.test`],
    );
    return userId;
  }

  async function createOpenMarket(
    actorId: string,
  ): Promise<{ marketId: string; outcomeAId: string }> {
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

    const outcomes = await uow.run((tx: DbTx) =>
      new DrizzleOutcomeRepository(tx).listByMarketId(market.id),
    );
    const outcomeA = outcomes.find((outcome) => outcome.code === "TEAM_A");
    if (!outcomeA) {
      throw new Error("expected TEAM_A outcome");
    }
    return { marketId: market.id, outcomeAId: outcomeA.id };
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

  async function createClosedMarketWithConfirmedResult(): Promise<{ marketId: string }> {
    const proposer = await createUser();
    const { marketId, outcomeAId } = await createOpenMarket(proposer);
    await closeMarket(proposer, marketId);
    const proposed = await proposeResult.execute({
      actorId: proposer,
      marketId,
      winningOutcomeId: outcomeAId,
      rawPayload: { winner: "TEAM_A" },
    });
    const confirmer = await createUser();
    await confirmResult.execute({ actorId: confirmer, resultId: proposed.id });
    return { marketId };
  }

  /**
   * Same synthetic-crash technique as `run.test.ts`'s "resumes a FAILED run" test: no naturally
   * occurring crash point exists until T-611's cross-batch resumption lands, so a genuinely
   * resumable `FAILED` run has to be constructed directly via the repositories.
   */
  async function synthesizeFailedRun(marketId: string): Promise<string> {
    const confirmedResult = await uow.run((tx: DbTx) =>
      new DrizzleMarketResultRepository(tx).findConfirmedByMarketId(marketId),
    );
    if (!confirmedResult) throw new Error("expected a confirmed result");
    await uow.run((tx: DbTx) => new DrizzleMarketRepository(tx).updateStatus(marketId, "SETTLING"));
    const run = await uow.run((tx: DbTx) =>
      new DrizzleSettlementRunRepository(tx).upsertInProgress({
        id: ids.next(),
        marketId,
        resultId: confirmedResult.id,
        startedAt: clock.now(),
      }),
    );
    await uow.run((tx: DbTx) =>
      new DrizzleSettlementRunRepository(tx).markFailed(run.id, clock.now()),
    );
    return run.id;
  }

  it("recovers a genuinely resumable FAILED run to COMPLETED", async () => {
    const { marketId } = await createClosedMarketWithConfirmedResult();
    const runId = await synthesizeFailedRun(marketId);

    const result = await sweepFailedSettlementRuns(sweeperDeps);

    expect(result.attempted).toBe(1);
    expect(result.recovered).toBe(1);
    expect(result.stillFailing).toBe(0);
    expect(result.alerted).toBe(0);

    const run = await uow.run((tx: DbTx) => new DrizzleSettlementRunRepository(tx).findById(runId));
    expect(run?.status).toBe("COMPLETED");
  });

  it("skips a FAILED run whose next_retry_at is still in the future", async () => {
    const { marketId } = await createClosedMarketWithConfirmedResult();
    const runId = await synthesizeFailedRun(marketId);
    const future = new Date(clock.now().getTime() + 60 * 60_000);
    await uow.run((tx: DbTx) =>
      new DrizzleSettlementRunRepository(tx).recordRetryAttempt(runId, {
        retryCount: 1,
        nextRetryAt: future,
      }),
    );

    const result = await sweepFailedSettlementRuns(sweeperDeps);

    expect(result.attempted).toBe(0);

    const run = await uow.run((tx: DbTx) => new DrizzleSettlementRunRepository(tx).findById(runId));
    expect(run?.status).toBe("FAILED");
  });

  it("does not re-attempt a run that has already completed", async () => {
    const { marketId } = await createClosedMarketWithConfirmedResult();
    const runId = await synthesizeFailedRun(marketId);
    const first = await sweepFailedSettlementRuns(sweeperDeps);
    expect(first.recovered).toBe(1);

    const second = await sweepFailedSettlementRuns(sweeperDeps);

    expect(second.attempted).toBe(0);
    const run = await uow.run((tx: DbTx) => new DrizzleSettlementRunRepository(tx).findById(runId));
    expect(run?.status).toBe("COMPLETED");
  });

  it("applies exponential backoff and alerts once a run has failed 3 times", async () => {
    const { marketId } = await createClosedMarketWithConfirmedResult();
    const runId = await synthesizeFailedRun(marketId);
    // Force every resume attempt to fail deterministically: the market is no longer
    // CLOSED/SETTLING (this bypasses TransitionMarketUseCase's own guards, simulating e.g. an
    // operator manually correcting a stuck market mid-incident), so `SettleMarketUseCase`'s
    // MARKET_NOT_SETTLEABLE precondition fires every single retry, independent of timing.
    await uow.run((tx: DbTx) => new DrizzleMarketRepository(tx).updateStatus(marketId, "OPEN"));

    const first = await sweepFailedSettlementRuns(sweeperDeps);
    expect(first.attempted).toBe(1);
    expect(first.stillFailing).toBe(1);
    expect(first.alerted).toBe(0);

    let run = await uow.run((tx: DbTx) => new DrizzleSettlementRunRepository(tx).findById(runId));
    expect(run?.retryCount).toBe(1);
    expect(run?.nextRetryAt).not.toBeNull();

    // Fast-forward past each backoff window so the next sweep picks the run back up.
    clock.set(new Date(clock.now().getTime() + 2 * 60 * 60_000));
    const second = await sweepFailedSettlementRuns(sweeperDeps);
    expect(second.stillFailing).toBe(1);
    expect(second.alerted).toBe(0);

    clock.set(new Date(clock.now().getTime() + 2 * 60 * 60_000));
    const third = await sweepFailedSettlementRuns(sweeperDeps);
    expect(third.stillFailing).toBe(1);
    expect(third.alerted).toBe(1);

    run = await uow.run((tx: DbTx) => new DrizzleSettlementRunRepository(tx).findById(runId));
    expect(run?.retryCount).toBe(3);
    expect(run?.status).toBe("FAILED");

    const alertEvents = await pool.query(
      "SELECT * FROM audit_events WHERE action = 'SETTLEMENT_RUN_ALERT' AND entity_id = $1",
      [runId],
    );
    expect(alertEvents.rowCount).toBe(1);
  });
});
