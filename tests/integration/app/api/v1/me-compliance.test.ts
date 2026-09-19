import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleSessionRepository } from "@/infra/db/repositories/session-repository";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { SystemClock } from "@/infra/clock";
import { SessionService } from "@/platform/session";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

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

const { GET: getLimitsRoute, PUT: putLimitsRoute } = await import("@/app/api/v1/me/limits/route");
const { POST: selfExcludeRoute } = await import("@/app/api/v1/me/self-exclusion/route");
const { GET: getActivitySummaryRoute } = await import("@/app/api/v1/me/activity-summary/route");

const APP_URL = "https://app.example.test";

function makeRequest(
  method: string,
  path: string,
  options: { cookie?: string; body?: unknown } = {},
): Request {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.cookie = options.cookie;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`${APP_URL}${path}`, {
    method,
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

describe("GET/PUT /me/limits, POST /me/self-exclusion, GET /me/activity-summary (T-812)", () => {
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

  async function createUser(): Promise<string> {
    const userId = ids.next();
    await pool.query(
      "INSERT INTO users (id, email, status, date_of_birth) VALUES ($1, $2, 'ACTIVE', '1990-01-01')",
      [userId, `rg-${randomUUID()}@example.test`],
    );
    return userId;
  }

  async function loginCookie(userId: string): Promise<string> {
    const { token } = await sessionService.createSession({ userId, ip: null, userAgent: null });
    return `sid=${token}`;
  }

  it("returns 401 for GET /me/limits without a session", async () => {
    const response = await getLimitsRoute(makeRequest("GET", "/api/v1/me/limits"));
    expect(response.status).toBe(401);
  });

  it("returns the default limit set for a brand-new user", async () => {
    const userId = await createUser();
    const cookie = await loginCookie(userId);

    const response = await getLimitsRoute(makeRequest("GET", "/api/v1/me/limits", { cookie }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      limits: { kind: string; period: string; currentValue: string }[];
    };
    expect(body.limits.length).toBeGreaterThan(0);
    const stakeDay = body.limits.find((l) => l.kind === "STAKE" && l.period === "DAY");
    expect(stakeDay?.currentValue).toBe("100000");
  });

  it("lowering a limit via PUT applies immediately", async () => {
    const userId = await createUser();
    const cookie = await loginCookie(userId);

    const response = await putLimitsRoute(
      makeRequest("PUT", "/api/v1/me/limits", {
        cookie,
        body: { kind: "STAKE", period: "DAY", value: "50000" },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      limit: { currentValue: string; pendingValue: string | null; effectiveValue: string };
    };
    expect(body.limit.currentValue).toBe("50000");
    expect(body.limit.pendingValue).toBeNull();
    expect(body.limit.effectiveValue).toBe("50000");
  });

  it("raising a limit via PUT defers, returning a pendingValue and effectiveAt", async () => {
    const userId = await createUser();
    const cookie = await loginCookie(userId);

    const response = await putLimitsRoute(
      makeRequest("PUT", "/api/v1/me/limits", {
        cookie,
        body: { kind: "STAKE", period: "DAY", value: "200000" },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      limit: { currentValue: string; pendingValue: string | null; effectiveAt: string | null };
    };
    expect(body.limit.currentValue).toBe("100000");
    expect(body.limit.pendingValue).toBe("200000");
    expect(body.limit.effectiveAt).not.toBeNull();
  });

  it("another user never sees the caller's limit changes (RULE-E02)", async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const ownerCookie = await loginCookie(owner);
    const attackerCookie = await loginCookie(attacker);

    await putLimitsRoute(
      makeRequest("PUT", "/api/v1/me/limits", {
        cookie: ownerCookie,
        body: { kind: "STAKE", period: "DAY", value: "50000" },
      }),
    );

    const response = await getLimitsRoute(
      makeRequest("GET", "/api/v1/me/limits", { cookie: attackerCookie }),
    );
    const body = (await response.json()) as { limits: { kind: string; currentValue: string }[] };
    const stakeDay = body.limits.find((l) => l.kind === "STAKE");
    expect(stakeDay?.currentValue).toBe("100000");
  });

  it("self-excludes and returns a future revocableAt for a time-boxed period", async () => {
    const userId = await createUser();
    const cookie = await loginCookie(userId);

    const response = await selfExcludeRoute(
      makeRequest("POST", "/api/v1/me/self-exclusion", { cookie, body: { period: "24H" } }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { revocableAt: string | null };
    expect(body.revocableAt).not.toBeNull();

    const row = await pool
      .query("SELECT status FROM users WHERE id = $1", [userId])
      .then((r) => r.rows[0] as { status: string });
    expect(row.status).toBe("SELF_EXCLUDED");
  });

  it("returns 401 for POST /me/self-exclusion without a session", async () => {
    const response = await selfExcludeRoute(
      makeRequest("POST", "/api/v1/me/self-exclusion", { body: { period: "24H" } }),
    );
    expect(response.status).toBe(401);
  });

  it("returns a zeroed activity summary for a user with no activity", async () => {
    const userId = await createUser();
    const cookie = await loginCookie(userId);

    const response = await getActivitySummaryRoute(
      makeRequest("GET", "/api/v1/me/activity-summary", { cookie }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      summary: {
        period: string;
        totalStakedMinor: string;
        totalWonMinor: string;
        netResultMinor: string;
        betCount: number;
      };
    };
    expect(body.summary.period).toBe("ALL");
    expect(body.summary.totalStakedMinor).toBe("0");
    expect(body.summary.totalWonMinor).toBe("0");
    expect(body.summary.netResultMinor).toBe("0");
    expect(body.summary.betCount).toBe(0);
  });

  it("returns 401 for GET /me/activity-summary without a session", async () => {
    const response = await getActivitySummaryRoute(
      makeRequest("GET", "/api/v1/me/activity-summary"),
    );
    expect(response.status).toBe(401);
  });
});
