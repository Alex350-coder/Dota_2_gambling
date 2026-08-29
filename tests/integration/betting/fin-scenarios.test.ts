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
import { DrizzleWalletRepository } from "@/infra/db/repositories/wallet-repository";
import { DrizzleBetSlipRepository } from "@/infra/db/repositories/bet-slip-repository";
import { DrizzleOrderRepository } from "@/infra/db/repositories/order-repository";
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
import { toBigIntRow } from "../../helpers/pg-bigint";

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
const { GET: getBetRoute } = await import("@/app/api/v1/bets/[id]/route");

const APP_URL = "https://app.example.test";

function postRequest(path: string, body: unknown, cookie: string, idempotencyKey: string): Request {
  return new Request(`${APP_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  });
}

function getRequest(path: string, cookie?: string): Request {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return new Request(`${APP_URL}${path}`, { method: "GET", headers });
}

/**
 * Consolidates the exact `Claude/Testing.md` financial scenario IDs this phase is responsible
 * for, in one place, by their literal IDs, rather than leaving each only incidentally covered
 * by a route- or use-case-level test file written for a different primary purpose.
 */
describe("Financial scenarios (FIN-12, FIN-13, FIN-16, FIN-19, FIN-21)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();
  const audit = new DrizzleAuditWriter();
  const ledger = new LedgerService(ids, clock);

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

  const placeOrder = new PlaceOrderUseCase<DbTx>({
    uow,
    markets,
    outcomes,
    economicProfiles,
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

  async function createMarketFixture(): Promise<{ marketId: string; outcomeAId: string }> {
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

    const outcomeRows = await pool
      .query("SELECT id, code FROM outcomes WHERE market_id = $1", [market.id])
      .then((r) => r.rows as { id: string; code: string }[]);
    const outcomeA = outcomeRows.find((row) => row.code === "TEAM_A");
    if (!outcomeA) throw new Error("outcome fixture missing");

    return { marketId: market.id, outcomeAId: outcomeA.id };
  }

  async function openMarket(): Promise<{ marketId: string; outcomeAId: string }> {
    const fixture = await createMarketFixture();
    await transitionMarket.execute({
      actorId: await createUser(),
      marketId: fixture.marketId,
      actor: "ADMIN",
      to: "OPEN",
    });
    return fixture;
  }

  it("FIN-12: insufficient funds rejects with INSUFFICIENT_FUNDS, no order, no ledger row", async () => {
    const { marketId, outcomeAId } = await openMarket();
    const userId = await createUser(1_000n);

    await expect(
      placeOrder.execute({
        userId,
        marketId,
        outcomeId: outcomeAId,
        requestedMinor: 5_000n,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });

    const orderCount = await pool
      .query("SELECT count(*)::int AS n FROM bet_orders WHERE user_id = $1", [userId])
      .then((r) => r.rows[0].n as number);
    expect(orderCount).toBe(0);

    const ledgerCount = await pool
      .query("SELECT count(*)::int AS n FROM ledger_entries WHERE account_key = $1", [
        `USER_AVAILABLE:${userId}`,
      ])
      .then((r) => r.rows[0].n as number);
    expect(ledgerCount).toBe(0);
  });

  it("FIN-13: placing against a closed market rejects with MARKET_CLOSED, no reservation", async () => {
    const { marketId, outcomeAId } = await createMarketFixture();
    const userId = await createUser();

    await expect(
      placeOrder.execute({
        userId,
        marketId,
        outcomeId: outcomeAId,
        requestedMinor: 5_000n,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "MARKET_CLOSED" });

    const wallet = await pool
      .query("SELECT available_minor, locked_minor FROM wallets WHERE user_id = $1", [userId])
      .then((r) =>
        toBigIntRow(r.rows[0] as { available_minor: bigint; locked_minor: bigint }, [
          "available_minor",
          "locked_minor",
        ]),
      );
    expect(wallet.locked_minor).toBe(0n);
    expect(wallet.available_minor).toBe(100_000n);
  });

  it("FIN-16: retrying POST /bets with the same Idempotency-Key returns one order, identical response", async () => {
    const { marketId, outcomeAId } = await openMarket();
    const userId = await createUser();
    const cookie = await loginCookie(userId);
    const idempotencyKey = randomUUID();
    const requestBody = { marketId, outcomeId: outcomeAId, amountMinor: "5000", currency: "PEN" };

    const first = await placeBetRoute(
      postRequest("/api/v1/bets", requestBody, cookie, idempotencyKey),
    );
    const firstBody = (await first.json()) as unknown;

    const second = await placeBetRoute(
      postRequest("/api/v1/bets", requestBody, cookie, idempotencyKey),
    );
    const secondBody = (await second.json()) as unknown;

    expect(second.status).toBe(first.status);
    expect(secondBody).toEqual(firstBody);

    const orderCount = await pool
      .query("SELECT count(*)::int AS n FROM bet_orders WHERE user_id = $1", [userId])
      .then((r) => r.rows[0].n as number);
    expect(orderCount).toBe(1);
  });

  it("FIN-19: user B reading user A's bet responds 404", async () => {
    const { marketId, outcomeAId } = await openMarket();
    const userA = await createUser();
    const userB = await createUser();
    const cookieB = await loginCookie(userB);

    const order = await placeOrder.execute({
      userId: userA,
      marketId,
      outcomeId: outcomeAId,
      requestedMinor: 5_000n,
      idempotencyKey: randomUUID(),
    });

    const response = await getBetRoute(getRequest(`/api/v1/bets/${order.id}`, cookieB), {
      params: Promise.resolve({ id: order.id }),
    });
    expect(response.status).toBe(404);
  });

  it("FIN-21: wallets, sessions, and orders are all scoped to their own user", async () => {
    const { marketId, outcomeAId } = await openMarket();
    const userA = await createUser(50_000n);
    const userB = await createUser(50_000n);

    const orderA = await placeOrder.execute({
      userId: userA,
      marketId,
      outcomeId: outcomeAId,
      requestedMinor: 5_000n,
      idempotencyKey: randomUUID(),
    });

    const walletA = await pool
      .query("SELECT available_minor FROM wallets WHERE user_id = $1", [userA])
      .then((r) => toBigIntRow(r.rows[0] as { available_minor: bigint }, ["available_minor"]));
    const walletB = await pool
      .query("SELECT available_minor FROM wallets WHERE user_id = $1", [userB])
      .then((r) => toBigIntRow(r.rows[0] as { available_minor: bigint }, ["available_minor"]));
    expect(walletA.available_minor).toBe(45_000n);
    expect(walletB.available_minor).toBe(50_000n);

    const ordersForB = await pool
      .query("SELECT count(*)::int AS n FROM bet_orders WHERE user_id = $1 AND id = $2", [
        userB,
        orderA.id,
      ])
      .then((r) => r.rows[0].n as number);
    expect(ordersForB).toBe(0);
  });
});
