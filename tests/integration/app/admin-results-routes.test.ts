import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleSessionRepository } from "@/infra/db/repositories/session-repository";
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
import { SystemClock } from "@/infra/clock";
import { SessionService } from "@/platform/session";
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

/** getContainer() is a lazy singleton (T-316) — env vars must be set before the first route call. */
process.env.APP_URL ??= "https://app.example.test";
process.env.ENCRYPTION_KEY ??= "0".repeat(48);
process.env.ARGON2_MEMORY_COST ??= "8";
process.env.ARGON2_TIME_COST ??= "1";
process.env.ARGON2_PARALLELISM ??= "1";
process.env.MFA_ISSUER ??= "Dota Gambling Test";
process.env.RATE_LIMIT_ENABLED ??= "true";
process.env.RG_DEFAULT_DAILY_STAKE_LIMIT_MINOR ??= "100000";
process.env.RG_LIMIT_INCREASE_COOLING_OFF_HOURS ??= "24";
process.env.SIMULATED_CREDIT_DAILY_CAP_MINOR ??= "100000";
process.env.METRICS_ENABLED ??= "true";
process.env.METRICS_TOKEN ??= "test-metrics-token";

const { POST: proposeResultRoute } = await import("@/app/api/v1/admin/markets/[id]/results/route");
const { POST: confirmResultRoute } = await import("@/app/api/v1/admin/results/[id]/confirm/route");
const { POST: disputeResultRoute } = await import("@/app/api/v1/admin/results/[id]/dispute/route");
const { POST: resolveDisputeRoute } = await import("@/app/api/v1/admin/results/[id]/resolve/route");

const APP_URL = "https://app.example.test";

function postRequest(path: string, body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) {
    headers.cookie = cookie;
  }
  return new Request(`${APP_URL}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

interface AdminRouteCase {
  readonly name: string;
  readonly call: (cookie?: string) => Promise<Response>;
}

/** Every admin route wraps `authorize()` + `requireStepUp()` (T-412) — MET-COV-04 requires one negative test per endpoint. */
const ADMIN_ROUTE_CASES: readonly AdminRouteCase[] = [
  {
    name: "POST /admin/markets/{id}/results",
    call: (cookie) =>
      proposeResultRoute(
        postRequest(
          `/api/v1/admin/markets/${randomUUID()}/results`,
          { winningOutcomeId: null, rawPayload: {} },
          cookie,
        ),
        { params: Promise.resolve({ id: randomUUID() }) },
      ),
  },
  {
    name: "POST /admin/results/{id}/confirm",
    call: (cookie) =>
      confirmResultRoute(postRequest(`/api/v1/admin/results/${randomUUID()}/confirm`, {}, cookie), {
        params: Promise.resolve({ id: randomUUID() }),
      }),
  },
  {
    name: "POST /admin/results/{id}/dispute",
    call: (cookie) =>
      disputeResultRoute(postRequest(`/api/v1/admin/results/${randomUUID()}/dispute`, {}, cookie), {
        params: Promise.resolve({ id: randomUUID() }),
      }),
  },
  {
    name: "POST /admin/results/{id}/resolve",
    call: (cookie) =>
      resolveDisputeRoute(
        postRequest(
          `/api/v1/admin/results/${randomUUID()}/resolve`,
          { winningOutcomeId: null, rawPayload: {} },
          cookie,
        ),
        { params: Promise.resolve({ id: randomUUID() }) },
      ),
  },
];

describe("admin results routes (T-613)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();
  const audit = new DrizzleAuditWriter();
  const sessions = (tx: DbTx) => new DrizzleSessionRepository(tx);
  const ledger = new LedgerService(ids, clock);

  const sessionService = new SessionService<DbTx>({
    uow,
    sessions,
    ids,
    clock,
    config: { ttlHours: 720, idleTimeoutHours: 168 },
  });

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

  async function createUser(roles: readonly string[] = []): Promise<string> {
    const userId = ids.next();
    await pool.query(
      "INSERT INTO users (id, email, status, date_of_birth) VALUES ($1, $2, 'ACTIVE', '1990-01-01')",
      [userId, `admin-results-route-${randomUUID()}@example.test`],
    );
    for (const role of roles) {
      await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", [userId, role]);
    }
    return userId;
  }

  async function loginCookie(
    userId: string,
    options: { stepUpAt?: Date | null } = {},
  ): Promise<string> {
    const { token, session } = await sessionService.createSession({
      userId,
      ip: null,
      userAgent: null,
    });
    if (options.stepUpAt) {
      await uow.run((tx) => sessions(tx).markMfaVerified(session.id, options.stepUpAt as Date));
    }
    return `sid=${token}`;
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
      closesAt: new Date(Date.now() + 60_000),
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

  describe.each(ADMIN_ROUTE_CASES)("$name (MET-COV-04)", ({ call }) => {
    it("rejects an unauthenticated request with 401", async () => {
      const response = await call();
      expect(response.status).toBe(401);
    });

    it("rejects a non-admin authenticated user with 403", async () => {
      const userId = await createUser();
      const cookie = await loginCookie(userId, { stepUpAt: new Date() });

      const response = await call(cookie);
      expect(response.status).toBe(403);
    });
  });

  it("propose -> confirm happy path: a different admin confirms and the response is 200", async () => {
    const proposer = await createUser(["ADMIN"]);
    const proposerCookie = await loginCookie(proposer, { stepUpAt: new Date() });
    const { marketId, outcomeAId } = await createClosedMarket(proposer);

    const proposeResponse = await proposeResultRoute(
      postRequest(
        `/api/v1/admin/markets/${marketId}/results`,
        { winningOutcomeId: outcomeAId, rawPayload: { winner: "TEAM_A" } },
        proposerCookie,
      ),
      { params: Promise.resolve({ id: marketId }) },
    );
    expect(proposeResponse.status).toBe(201);
    const { result: proposed } = (await proposeResponse.json()) as {
      result: { id: string };
    };

    const confirmer = await createUser(["ADMIN"]);
    const confirmerCookie = await loginCookie(confirmer, { stepUpAt: new Date() });
    const confirmResponse = await confirmResultRoute(
      postRequest(`/api/v1/admin/results/${proposed.id}/confirm`, {}, confirmerCookie),
      { params: Promise.resolve({ id: proposed.id }) },
    );
    expect(confirmResponse.status).toBe(200);
    const { result: confirmed } = (await confirmResponse.json()) as {
      result: { status: string; confirmedBy: string };
    };
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.confirmedBy).toBe(confirmer);
  });

  it("rejects a same-actor confirmation with 403 UNAUTHORIZED_OPERATION (4-eyes rule)", async () => {
    const proposer = await createUser(["ADMIN"]);
    const proposerCookie = await loginCookie(proposer, { stepUpAt: new Date() });
    const { marketId, outcomeAId } = await createClosedMarket(proposer);

    const proposeResponse = await proposeResultRoute(
      postRequest(
        `/api/v1/admin/markets/${marketId}/results`,
        { winningOutcomeId: outcomeAId, rawPayload: { winner: "TEAM_A" } },
        proposerCookie,
      ),
      { params: Promise.resolve({ id: marketId }) },
    );
    const { result: proposed } = (await proposeResponse.json()) as { result: { id: string } };

    const confirmResponse = await confirmResultRoute(
      postRequest(`/api/v1/admin/results/${proposed.id}/confirm`, {}, proposerCookie),
      { params: Promise.resolve({ id: proposed.id }) },
    );
    expect(confirmResponse.status).toBe(403);
    const body = (await confirmResponse.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED_OPERATION");
  });

  it("rejects a proposal from an actor who placed an order on the market with 403 (R-10)", async () => {
    const proposer = await createUser(["ADMIN"]);
    const { marketId, outcomeAId } = await createOpenMarket(proposer);

    const interactedActor = await createUser(["ADMIN"]);
    const interactedCookie = await loginCookie(interactedActor, { stepUpAt: new Date() });
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

    const response = await proposeResultRoute(
      postRequest(
        `/api/v1/admin/markets/${marketId}/results`,
        { winningOutcomeId: outcomeAId, rawPayload: { winner: "TEAM_A" } },
        interactedCookie,
      ),
      { params: Promise.resolve({ id: marketId }) },
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED_OPERATION");
  });

  it("propose -> dispute -> resolve: the old row is superseded and the new one is PROPOSED", async () => {
    const proposer = await createUser(["ADMIN"]);
    const proposerCookie = await loginCookie(proposer, { stepUpAt: new Date() });
    const { marketId, outcomeAId } = await createClosedMarket(proposer);

    const proposeResponse = await proposeResultRoute(
      postRequest(
        `/api/v1/admin/markets/${marketId}/results`,
        { winningOutcomeId: outcomeAId, rawPayload: { winner: "TEAM_A" } },
        proposerCookie,
      ),
      { params: Promise.resolve({ id: marketId }) },
    );
    const { result: proposed } = (await proposeResponse.json()) as { result: { id: string } };

    const disputer = await createUser(["ADMIN"]);
    const disputerCookie = await loginCookie(disputer, { stepUpAt: new Date() });
    const disputeResponse = await disputeResultRoute(
      postRequest(`/api/v1/admin/results/${proposed.id}/dispute`, {}, disputerCookie),
      { params: Promise.resolve({ id: proposed.id }) },
    );
    expect(disputeResponse.status).toBe(200);
    const { result: disputed } = (await disputeResponse.json()) as {
      result: { id: string; status: string };
    };
    expect(disputed.status).toBe("DISPUTED");

    const resolver = await createUser(["ADMIN"]);
    const resolverCookie = await loginCookie(resolver, { stepUpAt: new Date() });
    const resolveResponse = await resolveDisputeRoute(
      postRequest(
        `/api/v1/admin/results/${disputed.id}/resolve`,
        { winningOutcomeId: outcomeAId, rawPayload: { winner: "TEAM_A", corrected: true } },
        resolverCookie,
      ),
      { params: Promise.resolve({ id: disputed.id }) },
    );
    expect(resolveResponse.status).toBe(201);
    const { result: resolved } = (await resolveResponse.json()) as {
      result: { status: string; supersedesId: string };
    };
    expect(resolved.status).toBe("PROPOSED");
    expect(resolved.supersedesId).toBe(disputed.id);
  });
});
