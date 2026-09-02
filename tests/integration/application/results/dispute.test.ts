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
import { DisputeResultUseCase, ResolveDisputeUseCase } from "@/application/results/dispute";
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

describe("DisputeResultUseCase / ResolveDisputeUseCase", () => {
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
  const confirmResult = new ConfirmResultUseCase<DbTx>({
    uow,
    marketResults: (tx) => new DrizzleMarketResultRepository(tx),
    betOrders: (tx, ownerId) => new DrizzleOrderRepository(tx, ownerId),
    clock,
    audit,
  });
  const disputeResult = new DisputeResultUseCase<DbTx>({
    uow,
    marketResults: (tx) => new DrizzleMarketResultRepository(tx),
    audit,
  });
  const resolveDispute = new ResolveDisputeUseCase<DbTx>({
    uow,
    outcomes: (tx) => new DrizzleOutcomeRepository(tx),
    marketResults: (tx) => new DrizzleMarketResultRepository(tx),
    betOrders: (tx, ownerId) => new DrizzleOrderRepository(tx, ownerId),
    providerKey: provider.key,
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

  async function closeMarket(actorId: string, marketId: string): Promise<void> {
    await transitionMarket.execute({
      actorId,
      marketId,
      actor: "ADMIN",
      to: "CLOSED",
      manualClose: true,
    });
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

  async function createClosedMarket(
    actorId: string,
  ): Promise<{ marketId: string; outcomeAId: string }> {
    const { marketId, outcomeAId } = await createOpenMarket(actorId);
    await closeMarket(actorId, marketId);
    return { marketId, outcomeAId };
  }

  it("disputes a PROPOSED result, halting the path to CONFIRMED", async () => {
    const proposer = await createUser();
    const { marketId, outcomeAId } = await createClosedMarket(proposer);

    const proposed = await proposeResult.execute({
      actorId: proposer,
      marketId,
      winningOutcomeId: outcomeAId,
      rawPayload: { winner: "TEAM_A" },
    });

    const admin = await createUser();
    const disputed = await disputeResult.execute({ actorId: admin, resultId: proposed.id });

    expect(disputed.status).toBe("DISPUTED");

    const rows = await pool
      .query(
        "SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'RESULT_DISPUTED'",
        [disputed.id],
      )
      .then((r) => r.rows);
    expect(rows).toHaveLength(1);

    // Funds stay in escrow: a DISPUTED result can never reach CONFIRMED, so settlement's
    // RESULT_NOT_CONFIRMED precondition keeps blocking regardless of how long it stays disputed.
    const confirmedForMarket = await uow.run((tx: DbTx) =>
      new DrizzleMarketResultRepository(tx).findConfirmedByMarketId(marketId),
    );
    expect(confirmedForMarket).toBeNull();

    const confirmer = await createUser();
    await expect(
      confirmResult.execute({ actorId: confirmer, resultId: disputed.id }),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("disputes a VOID_PROPOSED result the same way", async () => {
    const proposer = await createUser();
    const { marketId } = await createClosedMarket(proposer);

    const proposed = await proposeResult.execute({
      actorId: proposer,
      marketId,
      winningOutcomeId: null,
      rawPayload: {},
    });

    const admin = await createUser();
    const disputed = await disputeResult.execute({ actorId: admin, resultId: proposed.id });
    expect(disputed.status).toBe("DISPUTED");
  });

  it("rejects disputing an already-CONFIRMED result with INVALID_STATE_TRANSITION", async () => {
    const proposer = await createUser();
    const confirmer = await createUser();
    const { marketId, outcomeAId } = await createClosedMarket(proposer);

    const proposed = await proposeResult.execute({
      actorId: proposer,
      marketId,
      winningOutcomeId: outcomeAId,
      rawPayload: { winner: "TEAM_A" },
    });
    const confirmed = await confirmResult.execute({ actorId: confirmer, resultId: proposed.id });

    const admin = await createUser();
    await expect(
      disputeResult.execute({ actorId: admin, resultId: confirmed.id }),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("rejects disputing a non-existent result with RESOURCE_NOT_FOUND", async () => {
    const admin = await createUser();
    await expect(
      disputeResult.execute({ actorId: admin, resultId: randomUUID() }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("resolves a dispute: supersedes the disputed row and inserts a fresh PROPOSED row", async () => {
    const proposer = await createUser();
    const { marketId, outcomeAId } = await createClosedMarket(proposer);

    const proposed = await proposeResult.execute({
      actorId: proposer,
      marketId,
      winningOutcomeId: outcomeAId,
      rawPayload: { winner: "TEAM_A" },
    });
    const admin = await createUser();
    const disputed = await disputeResult.execute({ actorId: admin, resultId: proposed.id });

    const resolver = await createUser();
    const resolved = await resolveDispute.execute({
      actorId: resolver,
      disputedResultId: disputed.id,
      winningOutcomeId: outcomeAId,
      rawPayload: { winner: "TEAM_A", corrected: true },
    });

    expect(resolved.status).toBe("PROPOSED");
    expect(resolved.supersedesId).toBe(disputed.id);
    expect(resolved.proposedBy).toBe(resolver);

    const oldRow = await uow.run((tx: DbTx) =>
      new DrizzleMarketResultRepository(tx).findById(disputed.id),
    );
    expect(oldRow?.status).toBe("SUPERSEDED");

    // History is never rewritten (RESULT_PROVIDERS.md §5) and current-result reads move on.
    const current = await uow.run((tx: DbTx) =>
      new DrizzleMarketResultRepository(tx).findCurrentByMarketId(marketId),
    );
    expect(current?.id).toBe(resolved.id);

    const rows = await pool
      .query(
        "SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'RESULT_RESOLVED'",
        [resolved.id],
      )
      .then((r) => r.rows);
    expect(rows).toHaveLength(1);

    // A superseded result never re-triggers settlement: the resolved (new) row still needs its
    // own independent 4-eyes confirmation before it can settle anything.
    const confirmedForMarket = await uow.run((tx: DbTx) =>
      new DrizzleMarketResultRepository(tx).findConfirmedByMarketId(marketId),
    );
    expect(confirmedForMarket).toBeNull();
  });

  it("resolves a dispute into a VOID_PROPOSED row when winningOutcomeId is null", async () => {
    const proposer = await createUser();
    const { marketId, outcomeAId } = await createClosedMarket(proposer);

    const proposed = await proposeResult.execute({
      actorId: proposer,
      marketId,
      winningOutcomeId: outcomeAId,
      rawPayload: { winner: "TEAM_A" },
    });
    const admin = await createUser();
    const disputed = await disputeResult.execute({ actorId: admin, resultId: proposed.id });

    const resolver = await createUser();
    const resolved = await resolveDispute.execute({
      actorId: resolver,
      disputedResultId: disputed.id,
      winningOutcomeId: null,
      rawPayload: { winner: null },
    });

    expect(resolved.status).toBe("VOID_PROPOSED");
    expect(resolved.winningOutcomeId).toBeNull();
  });

  it("rejects resolving a result that is not DISPUTED with INVALID_STATE_TRANSITION", async () => {
    const proposer = await createUser();
    const { marketId, outcomeAId } = await createClosedMarket(proposer);

    const proposed = await proposeResult.execute({
      actorId: proposer,
      marketId,
      winningOutcomeId: outcomeAId,
      rawPayload: { winner: "TEAM_A" },
    });

    const resolver = await createUser();
    await expect(
      resolveDispute.execute({
        actorId: resolver,
        disputedResultId: proposed.id,
        winningOutcomeId: outcomeAId,
        rawPayload: {},
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("rejects a resolve winningOutcomeId that does not belong to the market", async () => {
    const proposer = await createUser();
    const { marketId, outcomeAId } = await createClosedMarket(proposer);

    const proposed = await proposeResult.execute({
      actorId: proposer,
      marketId,
      winningOutcomeId: outcomeAId,
      rawPayload: { winner: "TEAM_A" },
    });
    const admin = await createUser();
    const disputed = await disputeResult.execute({ actorId: admin, resultId: proposed.id });

    const resolver = await createUser();
    await expect(
      resolveDispute.execute({
        actorId: resolver,
        disputedResultId: disputed.id,
        winningOutcomeId: randomUUID(),
        rawPayload: {},
      }),
    ).rejects.toMatchObject({ code: "INVALID_OUTCOME" });
  });

  it("R-10: rejects resolving a dispute by an account that placed an order on the market", async () => {
    const proposer = await createUser();
    const { marketId, outcomeAId } = await createOpenMarket(proposer);

    const interactedActor = await createUser();
    await pool.query(
      "INSERT INTO wallets (user_id, currency, available_minor, locked_minor) VALUES ($1, 'PEN', 50000, 0)",
      [interactedActor],
    );
    await placeOrder.execute({
      userId: interactedActor,
      marketId,
      outcomeId: outcomeAId,
      requestedMinor: 1_000n,
      idempotencyKey: randomUUID(),
    });

    await closeMarket(proposer, marketId);
    const proposed = await proposeResult.execute({
      actorId: proposer,
      marketId,
      winningOutcomeId: outcomeAId,
      rawPayload: { winner: "TEAM_A" },
    });
    const admin = await createUser();
    const disputed = await disputeResult.execute({ actorId: admin, resultId: proposed.id });

    await expect(
      resolveDispute.execute({
        actorId: interactedActor,
        disputedResultId: disputed.id,
        winningOutcomeId: outcomeAId,
        rawPayload: { winner: "TEAM_A" },
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED_OPERATION" });
  });
});
