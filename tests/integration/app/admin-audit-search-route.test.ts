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

const { GET: auditRoute } = await import("@/app/api/v1/admin/audit/route");

const APP_URL = "https://app.example.test";

describe("GET /admin/audit (T-907, MET-COV-04)", () => {
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
      [userId, `admin-audit-route-${randomUUID()}@example.test`],
    );
    for (const role of roles) {
      await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", [userId, role]);
    }
    return userId;
  }

  async function loginCookie(userId: string): Promise<string> {
    const { token } = await sessionService.createSession({ userId, ip: null, userAgent: null });
    return `sid=${token}`;
  }

  function get(query = ""): Request {
    return new Request(`${APP_URL}/api/v1/admin/audit${query}`, { method: "GET" });
  }

  function getWithCookie(cookie: string, query = ""): Request {
    return new Request(`${APP_URL}/api/v1/admin/audit${query}`, {
      method: "GET",
      headers: { cookie },
    });
  }

  it("rejects unauthenticated with 401 and non-admin, non-auditor with 403", async () => {
    const unauth = await auditRoute(get());
    expect(unauth.status).toBe(401);

    const plainUser = await createUser();
    const cookie = await loginCookie(plainUser);
    const forbidden = await auditRoute(getWithCookie(cookie));
    expect(forbidden.status).toBe(403);
  });

  it("returns filtered results for an ADMIN session", async () => {
    const adminId = await createUser(["ADMIN"]);
    const cookie = await loginCookie(adminId);
    const response = await auditRoute(
      getWithCookie(cookie, "?action=SESSION_CREATED_NEVER_HAPPENS"),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { events: unknown[]; meta: { total: number } };
    expect(body.meta.total).toBe(0);
  });

  it("returns results for an AUDITOR session too", async () => {
    const auditorId = await createUser(["AUDITOR"]);
    const cookie = await loginCookie(auditorId);
    const response = await auditRoute(getWithCookie(cookie));
    expect(response.status).toBe(200);
  });

  it("rejects an unknown query parameter with 422", async () => {
    const adminId = await createUser(["ADMIN"]);
    const cookie = await loginCookie(adminId);
    const response = await auditRoute(getWithCookie(cookie, "?bogus=1"));
    expect(response.status).toBe(422);
  });
});
