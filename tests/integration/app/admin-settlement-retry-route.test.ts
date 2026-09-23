import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleSessionRepository } from "@/infra/db/repositories/session-repository";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { SystemClock } from "@/infra/clock";
import { SessionService } from "@/platform/session";
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";

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

const { POST: retryRoute } = await import("@/app/api/v1/admin/settlements/[id]/retry/route");

const APP_URL = "https://app.example.test";

/**
 * The retry route is a thin pass-through — fetch the run, call the already-exhaustively-tested
 * `SettleMarketUseCase` with its marketId (idempotency of the FAILED -> COMPLETED resume itself
 * is proven by `tests/integration/application/settlement/run.test.ts` and `sweeper.test.ts`, not
 * re-proven here). This suite covers what's actually new: the route's own authz/step-up gate
 * (MET-COV-04) and that an unknown run id is reported as RESOURCE_NOT_FOUND before any
 * settlement logic runs.
 */
describe("POST /admin/settlements/{id}/retry (T-906, MET-COV-04)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();
  const sessions = (tx: DbTx) => new DrizzleSessionRepository(tx);

  const sessionService = new SessionService<DbTx>({
    uow,
    sessions,
    ids,
    clock,
    config: { ttlHours: 720, idleTimeoutHours: 168 },
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
      [userId, `admin-retry-route-${randomUUID()}@example.test`],
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

  function routeParams(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  function post(runId: string, cookie?: string): Request {
    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = cookie;
    return new Request(`${APP_URL}/api/v1/admin/settlements/${runId}/retry`, {
      method: "POST",
      headers,
      body: "{}",
    });
  }

  it("rejects unauthenticated with 401 and non-admin with 403", async () => {
    const runId = randomUUID();
    const unauth = await retryRoute(post(runId), routeParams(runId));
    expect(unauth.status).toBe(401);

    const plainUser = await createUser();
    const cookie = await loginCookie(plainUser, { stepUpAt: new Date() });
    const forbidden = await retryRoute(post(runId, cookie), routeParams(runId));
    expect(forbidden.status).toBe(403);
  });

  it("rejects an admin without a recent step-up with MFA_REQUIRED", async () => {
    const runId = randomUUID();
    const adminId = await createUser(["ADMIN"]);
    const cookie = await loginCookie(adminId);
    const response = await retryRoute(post(runId, cookie), routeParams(runId));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("MFA_REQUIRED");
  });

  it("reports RESOURCE_NOT_FOUND for an unknown settlement run before any settlement logic runs", async () => {
    const runId = randomUUID();
    const adminId = await createUser(["ADMIN"]);
    const cookie = await loginCookie(adminId, { stepUpAt: new Date() });
    const response = await retryRoute(post(runId, cookie), routeParams(runId));
    expect(response.status).toBe(404);
  });
});
