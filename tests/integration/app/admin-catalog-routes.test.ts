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

const { POST: createGameRoute } = await import("@/app/api/v1/admin/games/route");

const APP_URL = "https://app.example.test";

function postRequest(path: string, body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) {
    headers.cookie = cookie;
  }
  return new Request(`${APP_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("admin catalog routes: step-up auth gate (T-412)", () => {
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
      [userId, `admin-route-${randomUUID()}@example.test`],
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

  it("rejects an unauthenticated request with UNAUTHENTICATED", async () => {
    const response = await createGameRoute(
      postRequest("/api/v1/admin/games", { slug: `g-${randomUUID()}`, name: "G" }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects a non-admin authenticated user with UNAUTHORIZED_OPERATION", async () => {
    const userId = await createUser();
    const cookie = await loginCookie(userId, { stepUpAt: new Date() });

    const response = await createGameRoute(
      postRequest("/api/v1/admin/games", { slug: `g-${randomUUID()}`, name: "G" }, cookie),
    );
    expect(response.status).toBe(403);
  });

  it("rejects an admin without a recent step-up verification with MFA_REQUIRED", async () => {
    const userId = await createUser(["ADMIN"]);
    const cookie = await loginCookie(userId);

    const response = await createGameRoute(
      postRequest("/api/v1/admin/games", { slug: `g-${randomUUID()}`, name: "G" }, cookie),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("MFA_REQUIRED");
  });

  it("rejects an admin whose step-up verification has expired with MFA_REQUIRED", async () => {
    const userId = await createUser(["ADMIN"]);
    const stale = new Date(Date.now() - 60 * 60_000);
    const cookie = await loginCookie(userId, { stepUpAt: stale });

    const response = await createGameRoute(
      postRequest("/api/v1/admin/games", { slug: `g-${randomUUID()}`, name: "G" }, cookie),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("MFA_REQUIRED");
  });

  it("creates a game for an admin with a fresh step-up verification", async () => {
    const userId = await createUser(["ADMIN"]);
    const cookie = await loginCookie(userId, { stepUpAt: new Date() });

    const response = await createGameRoute(
      postRequest("/api/v1/admin/games", { slug: `g-${randomUUID()}`, name: "G" }, cookie),
    );
    expect(response.status).toBe(201);
  });
});
