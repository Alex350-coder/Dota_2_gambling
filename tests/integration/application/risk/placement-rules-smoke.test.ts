import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { evaluatePlacementRiskRules, evaluateCloseWindowDispute } from "@/application/risk";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

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

const { getContainer } = await import("@/platform/http/container");

/**
 * End-to-end SQL-syntax smoke test for T-914: places one real, fully-fixtured order (game ->
 * tournament -> match -> market type -> economic profile -> streamer -> market -> OPEN) and
 * runs every placement-triggered rule (R-03..R-06, R-08, R-09) plus R-07 directly against it —
 * unlike rules.test.ts's mocked-`tx.execute` unit tests, this exercises the real CTEs against
 * the real schema, so a column-name or join typo fails here rather than only surfacing (silently
 * swallowed by the route's fire-and-forget `.catch()`) in production.
 */
describe("risk rule SQL smoke test (T-913/T-914)", () => {
  const pool = createPool(testDbConfig());

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createUser(availableMinor = 100_000n): Promise<string> {
    const container = getContainer();
    const userId = container.ids.next();
    await pool.query(
      "INSERT INTO users (id, email, status, date_of_birth) VALUES ($1, $2, 'ACTIVE', '1990-01-01')",
      [userId, `risk-smoke-${randomUUID()}@example.test`],
    );
    await pool.query(
      "INSERT INTO wallets (user_id, currency, available_minor, locked_minor) VALUES ($1, 'PEN', $2, 0)",
      [userId, availableMinor],
    );
    return userId;
  }

  async function createOpenMarket(): Promise<{ marketId: string; outcomeAId: string }> {
    const container = getContainer();
    const actorId = await createUser();
    const game = await container.createGame.execute({
      actorId,
      slug: `g-${randomUUID()}`,
      name: "G",
    });
    const modeRow = await pool
      .query("INSERT INTO game_modes (game_id, name) VALUES ($1, 'Std') RETURNING id", [game.id])
      .then((r) => r.rows[0] as { id: string });
    const tournament = await container.createTournament.execute({
      actorId,
      gameId: game.id,
      name: "T",
      startsAt: new Date(),
    });
    const match = await container.createMatch.execute({
      actorId,
      tournamentId: tournament.id,
      gameModeId: modeRow.id,
      scheduledAt: new Date(),
    });
    const marketType = await container.createMarketType.execute({
      actorId,
      code: `MW_${randomUUID()}`,
      name: "Match Winner",
      outcomeCardinality: "BINARY",
    });
    const profile = await container.createEconomicProfile.execute({
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
    const streamer = await container.createStreamer.execute({
      actorId,
      userId: streamerUserId,
      displayName: "S",
      defaultCommissionBps: 2000,
    });
    const market = await container.createMarket.execute({
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
    await container.transitionMarket.execute({
      actorId,
      marketId: market.id,
      actor: "ADMIN",
      to: "OPEN",
    });

    const outcomeRows = await pool
      .query("SELECT id, code FROM outcomes WHERE market_id = $1", [market.id])
      .then((r) => r.rows as { id: string; code: string }[]);
    const outcomeA = outcomeRows.find((row) => row.code === "TEAM_A");
    if (!outcomeA) throw new Error("outcome fixture missing");

    return { marketId: market.id, outcomeAId: outcomeA.id };
  }

  it("runs every placement rule against a real order without throwing", async () => {
    const container = getContainer();
    const { marketId, outcomeAId } = await createOpenMarket();
    const bettorId = await createUser();

    const order = await container.placeOrder.execute({
      userId: bettorId,
      marketId,
      outcomeId: outcomeAId,
      requestedMinor: 1_000n,
      idempotencyKey: `risk-smoke-${randomUUID()}`,
    });

    await expect(
      container.uow.run((tx) =>
        evaluatePlacementRiskRules(
          tx,
          {
            riskSignals: container.riskSignals,
            riskAlerts: container.riskAlerts,
            ids: container.ids,
            clock: container.clock,
          },
          order.id,
        ),
      ),
    ).resolves.toBeUndefined();
  });

  it("runs the close-window-dispute rule against a real market without throwing", async () => {
    const container = getContainer();
    const { marketId } = await createOpenMarket();

    await expect(
      container.uow.run((tx) =>
        evaluateCloseWindowDispute(
          tx,
          {
            riskSignals: container.riskSignals,
            riskAlerts: container.riskAlerts,
            ids: container.ids,
            clock: container.clock,
          },
          marketId,
        ),
      ),
    ).resolves.toBeUndefined();
  });
});
