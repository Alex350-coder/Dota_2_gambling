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
import { DrizzleMarketResultRepository } from "@/infra/db/repositories/market-result-repository";
import { CryptoIdGenerator } from "@/infra/id-generator";
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
import { ProposeResultUseCase } from "@/application/results/propose";
import { ConfirmResultUseCase } from "@/application/results/confirm";
import { ManualAdminResultProvider } from "@/infra/results";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { DrizzleOrderRepository } from "@/infra/db/repositories/order-repository";
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

const { POST: settleRoute } = await import("@/app/api/v1/admin/markets/[id]/settle/route");
const { POST: voidRoute } = await import("@/app/api/v1/admin/markets/[id]/void/route");
const { GET: listSettlementsRoute } = await import("@/app/api/v1/admin/settlements/route");
const { GET: getSettlementRoute } = await import("@/app/api/v1/admin/settlements/[id]/route");

const APP_URL = "https://app.example.test";

function postRequest(path: string, cookie?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) {
    headers.cookie = cookie;
  }
  return new Request(`${APP_URL}${path}`, { method: "POST", headers, body: "{}" });
}

function getRequest(path: string, cookie?: string): Request {
  const headers: Record<string, string> = {};
  if (cookie) {
    headers.cookie = cookie;
  }
  return new Request(`${APP_URL}${path}`, { method: "GET", headers });
}

interface AdminRouteCase {
  readonly name: string;
  readonly call: (cookie?: string) => Promise<Response>;
}

/** Every admin route wraps `authorize()` (T-412) — MET-COV-04 requires one negative test per endpoint. */
const ADMIN_ROUTE_CASES: readonly AdminRouteCase[] = [
  {
    name: "POST /admin/markets/{id}/settle",
    call: (cookie) =>
      settleRoute(postRequest(`/api/v1/admin/markets/${randomUUID()}/settle`, cookie), {
        params: Promise.resolve({ id: randomUUID() }),
      }),
  },
  {
    name: "POST /admin/markets/{id}/void",
    call: (cookie) =>
      voidRoute(postRequest(`/api/v1/admin/markets/${randomUUID()}/void`, cookie), {
        params: Promise.resolve({ id: randomUUID() }),
      }),
  },
  {
    name: "GET /admin/settlements",
    call: (cookie) => listSettlementsRoute(getRequest("/api/v1/admin/settlements", cookie)),
  },
  {
    name: "GET /admin/settlements/{id}",
    call: (cookie) =>
      getSettlementRoute(getRequest(`/api/v1/admin/settlements/${randomUUID()}`, cookie), {
        params: Promise.resolve({ id: randomUUID() }),
      }),
  },
];

describe("admin settlement routes (T-613)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();
  const audit = new DrizzleAuditWriter();
  const provider = new ManualAdminResultProvider();
  const sessions = (tx: DbTx) => new DrizzleSessionRepository(tx);

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
  const proposeResult = new ProposeResultUseCase<DbTx>({
    uow,
    outcomes: (tx) => new DrizzleOutcomeRepository(tx),
    markets: (tx) => new DrizzleMarketRepository(tx),
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
      [userId, `admin-settlement-route-${randomUUID()}@example.test`],
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

  async function createClosedMarketWithConfirmedResult(
    proposer: string,
  ): Promise<{ marketId: string; outcomeAId: string }> {
    const { marketId, outcomeAId } = await createOpenMarket(proposer);
    await closeMarket(proposer, marketId);
    const proposed = await proposeResult.execute({
      actorId: proposer,
      marketId,
      winningOutcomeId: outcomeAId,
      rawPayload: { winner: "TEAM_A" },
    });
    const confirmer = await createUser(["ADMIN"]);
    await confirmResult.execute({ actorId: confirmer, resultId: proposed.id });
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

  it("settles a CLOSED market with a CONFIRMED result: run COMPLETED, market SETTLED", async () => {
    const admin = await createUser(["ADMIN"]);
    const cookie = await loginCookie(admin, { stepUpAt: new Date() });
    const { marketId } = await createClosedMarketWithConfirmedResult(admin);

    const response = await settleRoute(
      postRequest(`/api/v1/admin/markets/${marketId}/settle`, cookie),
      { params: Promise.resolve({ id: marketId }) },
    );
    expect(response.status).toBe(200);
    const { run } = (await response.json()) as { run: { status: string; marketId: string } };
    expect(run.status).toBe("COMPLETED");
    expect(run.marketId).toBe(marketId);

    const market = await uow.run((tx: DbTx) => new DrizzleMarketRepository(tx).findById(marketId));
    expect(market?.status).toBe("SETTLED");
  });

  it("voids a CLOSED market: market becomes VOID", async () => {
    const admin = await createUser(["ADMIN"]);
    const cookie = await loginCookie(admin, { stepUpAt: new Date() });
    const { marketId } = await createOpenMarket(admin);
    await closeMarket(admin, marketId);

    const response = await voidRoute(
      postRequest(`/api/v1/admin/markets/${marketId}/void`, cookie),
      {
        params: Promise.resolve({ id: marketId }),
      },
    );
    expect(response.status).toBe(200);
    const { market } = (await response.json()) as { market: { status: string } };
    expect(market.status).toBe("VOID");
  });

  it("lists settlement runs, paginated, newest first", async () => {
    const admin = await createUser(["ADMIN"]);
    const cookie = await loginCookie(admin, { stepUpAt: new Date() });
    const { marketId } = await createClosedMarketWithConfirmedResult(admin);
    await settleRoute(postRequest(`/api/v1/admin/markets/${marketId}/settle`, cookie), {
      params: Promise.resolve({ id: marketId }),
    });

    const response = await listSettlementsRoute(getRequest("/api/v1/admin/settlements", cookie));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      settlementRuns: Array<{ marketId: string }>;
      meta: { total: number; page: number; limit: number };
    };
    expect(body.settlementRuns.some((run) => run.marketId === marketId)).toBe(true);
    expect(body.meta.total).toBeGreaterThan(0);
  });

  it("gets a single settlement run by id", async () => {
    const admin = await createUser(["ADMIN"]);
    const cookie = await loginCookie(admin, { stepUpAt: new Date() });
    const { marketId } = await createClosedMarketWithConfirmedResult(admin);
    const settleResponse = await settleRoute(
      postRequest(`/api/v1/admin/markets/${marketId}/settle`, cookie),
      { params: Promise.resolve({ id: marketId }) },
    );
    const { run } = (await settleResponse.json()) as { run: { id: string } };

    const response = await getSettlementRoute(
      getRequest(`/api/v1/admin/settlements/${run.id}`, cookie),
      { params: Promise.resolve({ id: run.id }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { run: { id: string; marketId: string } };
    expect(body.run.id).toBe(run.id);
    expect(body.run.marketId).toBe(marketId);
  });

  it("returns RESOURCE_NOT_FOUND for an unknown settlement run id", async () => {
    const admin = await createUser(["ADMIN"]);
    const cookie = await loginCookie(admin, { stepUpAt: new Date() });

    const response = await getSettlementRoute(
      getRequest(`/api/v1/admin/settlements/${randomUUID()}`, cookie),
      { params: Promise.resolve({ id: randomUUID() }) },
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });
});
