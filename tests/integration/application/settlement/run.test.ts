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

describe("SettleMarketUseCase", () => {
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

  async function createClosedMarketWithConfirmedResult(): Promise<{
    marketId: string;
    outcomeAId: string;
  }> {
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
    return { marketId, outcomeAId };
  }

  it("starts a run, passes through CLOSED -> SETTLING, and finalises to COMPLETED/SETTLED on the first attempt", async () => {
    const admin = await createUser();
    const { marketId } = await createClosedMarketWithConfirmedResult();

    // No orders exist on this fixture market, so Phase 2 has nothing to settle and Phase 3
    // finalises immediately in the same call (T-609) — CLOSED -> SETTLING is an intermediate
    // step within this same transaction, not an observable end state here.
    const run = await settleMarket.execute({ actorId: admin, marketId });

    expect(run.status).toBe("COMPLETED");
    expect(run.marketId).toBe(marketId);

    const market = await uow.run((tx: DbTx) => new DrizzleMarketRepository(tx).findById(marketId));
    expect(market?.status).toBe("SETTLED");
  });

  it("rejects settling a market that is not CLOSED or SETTLING with MARKET_NOT_SETTLEABLE", async () => {
    const admin = await createUser();
    const { marketId } = await createOpenMarket(admin);

    await expect(settleMarket.execute({ actorId: admin, marketId })).rejects.toMatchObject({
      code: "MARKET_NOT_SETTLEABLE",
    });
  });

  it("rejects settling a CLOSED market with no CONFIRMED result with RESULT_NOT_CONFIRMED", async () => {
    const admin = await createUser();
    const { marketId } = await createOpenMarket(admin);
    await closeMarket(admin, marketId);

    await expect(settleMarket.execute({ actorId: admin, marketId })).rejects.toMatchObject({
      code: "RESULT_NOT_CONFIRMED",
    });
  });

  it("rejects settling a market whose result is only PROPOSED (not yet CONFIRMED)", async () => {
    const proposer = await createUser();
    const { marketId, outcomeAId } = await createOpenMarket(proposer);
    await closeMarket(proposer, marketId);
    await proposeResult.execute({
      actorId: proposer,
      marketId,
      winningOutcomeId: outcomeAId,
      rawPayload: { winner: "TEAM_A" },
    });

    await expect(settleMarket.execute({ actorId: proposer, marketId })).rejects.toMatchObject({
      code: "RESULT_NOT_CONFIRMED",
    });
  });

  it("rejects re-settling a market with a COMPLETED run with ALREADY_SETTLED", async () => {
    const admin = await createUser();
    const { marketId } = await createClosedMarketWithConfirmedResult();
    const run = await settleMarket.execute({ actorId: admin, marketId });
    expect(run.status).toBe("COMPLETED");

    await expect(settleMarket.execute({ actorId: admin, marketId })).rejects.toMatchObject({
      code: "ALREADY_SETTLED",
    });
  });

  it("the DB-level unique index makes a second COMPLETED run for one market impossible", async () => {
    const admin = await createUser();
    const { marketId } = await createClosedMarketWithConfirmedResult();
    const run = await settleMarket.execute({ actorId: admin, marketId });
    expect(run.status).toBe("COMPLETED");

    const secondRunId = ids.next();
    await expect(
      pool.query(
        `INSERT INTO settlement_runs (id, market_id, result_id, status, started_at)
         VALUES ($1, $2, $3, 'COMPLETED', now())`,
        [secondRunId, marketId, run.resultId],
      ),
    ).rejects.toThrow(/one_completed_run_per_market|duplicate key/i);
  });

  it("resumes a FAILED run instead of starting a new one", async () => {
    const admin = await createUser();
    const { marketId } = await createClosedMarketWithConfirmedResult();

    // Synthesize a mid-run crash: leave the market SETTLING with a FAILED run behind, without
    // ever going through Phase 3. A real `execute()` call now always finalises to COMPLETED in
    // one transaction (no crash point exists to hit this naturally until T-611's cross-batch
    // resumption lands), so this is the only way to exercise the FAILED -> IN_PROGRESS resume
    // guard today.
    const confirmedResult = await uow.run((tx: DbTx) =>
      new DrizzleMarketResultRepository(tx).findConfirmedByMarketId(marketId),
    );
    if (!confirmedResult) throw new Error("expected a confirmed result");
    await uow.run((tx: DbTx) => new DrizzleMarketRepository(tx).updateStatus(marketId, "SETTLING"));
    const crashedRun = await uow.run((tx: DbTx) =>
      new DrizzleSettlementRunRepository(tx).upsertInProgress({
        id: ids.next(),
        marketId,
        resultId: confirmedResult.id,
        startedAt: clock.now(),
      }),
    );
    await uow.run((tx: DbTx) =>
      new DrizzleSettlementRunRepository(tx).markFailed(crashedRun.id, clock.now()),
    );

    const resumed = await settleMarket.execute({ actorId: admin, marketId });

    expect(resumed.id).toBe(crashedRun.id);
    expect(resumed.status).toBe("COMPLETED");
  });

  it("rejects settling a market whose run is already IN_PROGRESS with ALREADY_SETTLED", async () => {
    const admin = await createUser();
    const { marketId } = await createClosedMarketWithConfirmedResult();

    // Synthesize a concurrent-attempt snapshot: market SETTLING with a run already
    // IN_PROGRESS, without ever calling `execute()` (which would run straight through to
    // COMPLETED on this order-less fixture market).
    const confirmedResult = await uow.run((tx: DbTx) =>
      new DrizzleMarketResultRepository(tx).findConfirmedByMarketId(marketId),
    );
    if (!confirmedResult) throw new Error("expected a confirmed result");
    await uow.run((tx: DbTx) => new DrizzleMarketRepository(tx).updateStatus(marketId, "SETTLING"));
    await uow.run((tx: DbTx) =>
      new DrizzleSettlementRunRepository(tx).upsertInProgress({
        id: ids.next(),
        marketId,
        resultId: confirmedResult.id,
        startedAt: clock.now(),
      }),
    );

    await expect(settleMarket.execute({ actorId: admin, marketId })).rejects.toMatchObject({
      code: "ALREADY_SETTLED",
    });
  });

  it("rejects settling a non-existent market with RESOURCE_NOT_FOUND", async () => {
    const admin = await createUser();
    await expect(
      settleMarket.execute({ actorId: admin, marketId: randomUUID() }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});
