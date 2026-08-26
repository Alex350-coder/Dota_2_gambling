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
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
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
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

/** getContainer() is a lazy singleton (T-316) — env vars must be set before the first route call. */
process.env.APP_URL ??= "https://app.example.test";
process.env.ENCRYPTION_KEY ??= "0".repeat(48);
process.env.ARGON2_MEMORY_COST ??= "8";
process.env.ARGON2_TIME_COST ??= "1";
process.env.ARGON2_PARALLELISM ??= "1";
process.env.MFA_ISSUER ??= "Dota Gambling Test";
process.env.RATE_LIMIT_ENABLED ??= "false";
process.env.RG_DEFAULT_DAILY_STAKE_LIMIT_MINOR ??= "100000";
process.env.RG_LIMIT_INCREASE_COOLING_OFF_HOURS ??= "24";
process.env.SIMULATED_CREDIT_DAILY_CAP_MINOR ??= "100000";
process.env.METRICS_ENABLED ??= "true";
process.env.METRICS_TOKEN ??= "test-metrics-token";

const { POST: placeBetRoute } = await import("@/app/api/v1/bets/route");

const APP_URL = "https://app.example.test";

function postRequest(
  path: string,
  body: unknown,
  options: { cookie?: string; idempotencyKey?: string } = {},
): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.cookie) headers.cookie = options.cookie;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  return new Request(`${APP_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /bets (T-512)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();
  const audit = new DrizzleAuditWriter();
  const sessions = (tx: DbTx) => new DrizzleSessionRepository(tx);

  const sessionService = new SessionService<DbTx>({
    uow,
    sessions,
    ids,
    clock,
    config: { ttlHours: 720, idleTimeoutHours: 168 },
  });

  const markets = (tx: DbTx) => new DrizzleMarketRepository(tx);
  const economicProfiles = (tx: DbTx) => new DrizzleEconomicProfileRepository(tx);
  const outcomes = (tx: DbTx) => new DrizzleOutcomeRepository(tx);

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

  async function loginCookie(userId: string): Promise<string> {
    const { token } = await sessionService.createSession({ userId, ip: null, userAgent: null });
    return `sid=${token}`;
  }

  async function createOpenMarket(): Promise<{ marketId: string; outcomeAId: string }> {
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
      closesAt: new Date(Date.now() + 86_400_000),
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
    if (!outcomeA) throw new Error("outcome fixture missing");

    return { marketId: market.id, outcomeAId: outcomeA.id };
  }

  it("rejects an unauthenticated request with UNAUTHENTICATED", async () => {
    const response = await placeBetRoute(
      postRequest(
        "/api/v1/bets",
        { marketId: randomUUID(), outcomeId: randomUUID(), amountMinor: "5000", currency: "PEN" },
        { idempotencyKey: randomUUID() },
      ),
    );
    expect(response.status).toBe(401);
  });

  it("rejects a request missing the Idempotency-Key header with VALIDATION_FAILED", async () => {
    const { marketId, outcomeAId } = await createOpenMarket();
    const userId = await createUser();
    const cookie = await loginCookie(userId);

    const response = await placeBetRoute(
      postRequest(
        "/api/v1/bets",
        { marketId, outcomeId: outcomeAId, amountMinor: "5000", currency: "PEN" },
        { cookie },
      ),
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects a body with a server-controlled field via strict schema", async () => {
    const { marketId, outcomeAId } = await createOpenMarket();
    const userId = await createUser();
    const cookie = await loginCookie(userId);

    const response = await placeBetRoute(
      postRequest(
        "/api/v1/bets",
        {
          marketId,
          outcomeId: outcomeAId,
          amountMinor: "5000",
          currency: "PEN",
          status: "MATCHED",
        },
        { cookie, idempotencyKey: randomUUID() },
      ),
    );
    expect(response.status).toBe(422);
  });

  it("places a bet and returns 201 with the created order", async () => {
    const { marketId, outcomeAId } = await createOpenMarket();
    const userId = await createUser();
    const cookie = await loginCookie(userId);

    const response = await placeBetRoute(
      postRequest(
        "/api/v1/bets",
        { marketId, outcomeId: outcomeAId, amountMinor: "5000", currency: "PEN" },
        { cookie, idempotencyKey: randomUUID() },
      ),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      order: { id: string; status: string; unmatchedMinor: string; matchedMinor: string };
    };
    expect(body.order.status).toBe("OPEN");
    expect(body.order.unmatchedMinor).toBe("5000");
    expect(body.order.matchedMinor).toBe("0");
  });

  it("replays the same response on a retried request with the same Idempotency-Key", async () => {
    const { marketId, outcomeAId } = await createOpenMarket();
    const userId = await createUser();
    const cookie = await loginCookie(userId);
    const idempotencyKey = randomUUID();
    const requestBody = { marketId, outcomeId: outcomeAId, amountMinor: "5000", currency: "PEN" };

    const first = await placeBetRoute(
      postRequest("/api/v1/bets", requestBody, { cookie, idempotencyKey }),
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { order: { id: string } };

    const second = await placeBetRoute(
      postRequest("/api/v1/bets", requestBody, { cookie, idempotencyKey }),
    );
    expect(second.status).toBe(201);
    const secondBody = (await second.json()) as { order: { id: string } };
    expect(secondBody.order.id).toBe(firstBody.order.id);

    const orderCount = await pool
      .query("SELECT count(*)::int AS n FROM bet_orders WHERE id = $1", [firstBody.order.id])
      .then((r) => r.rows[0].n as number);
    expect(orderCount).toBe(1);
  });

  it("rejects insufficient funds with 409 INSUFFICIENT_FUNDS", async () => {
    const { marketId, outcomeAId } = await createOpenMarket();
    const userId = await createUser(1_000n);
    const cookie = await loginCookie(userId);

    const response = await placeBetRoute(
      postRequest(
        "/api/v1/bets",
        { marketId, outcomeId: outcomeAId, amountMinor: "5000", currency: "PEN" },
        { cookie, idempotencyKey: randomUUID() },
      ),
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INSUFFICIENT_FUNDS");
  });
});
