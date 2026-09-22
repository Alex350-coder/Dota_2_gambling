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

const { GET: listUsersRoute } = await import("@/app/api/v1/admin/users/route");
const { GET: getUserRoute } = await import("@/app/api/v1/admin/users/[id]/route");
const { POST: suspendRoute } = await import("@/app/api/v1/admin/users/[id]/suspend/route");
const { POST: restoreRoute } = await import("@/app/api/v1/admin/users/[id]/restore/route");

const APP_URL = "https://app.example.test";

function request(method: string, path: string, cookie?: string): Request {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return new Request(`${APP_URL}${path}`, {
    method,
    headers,
    body: method === "POST" ? "{}" : null,
  });
}

describe("admin users routes (T-903, MET-COV-04)", () => {
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
      [userId, `admin-users-route-${randomUUID()}@example.test`],
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

  it("GET /admin/users rejects unauthenticated with 401 and non-admin with 403", async () => {
    const unauth = await listUsersRoute(request("GET", "/api/v1/admin/users"));
    expect(unauth.status).toBe(401);

    const plainUser = await createUser();
    const cookie = await loginCookie(plainUser);
    const forbidden = await listUsersRoute(request("GET", "/api/v1/admin/users", cookie));
    expect(forbidden.status).toBe(403);
  });

  it("GET /admin/users returns a page of users for an admin", async () => {
    const adminId = await createUser(["ADMIN"]);
    const cookie = await loginCookie(adminId);
    const response = await listUsersRoute(request("GET", "/api/v1/admin/users", cookie));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { users: unknown[]; meta: { total: number } };
    expect(body.meta.total).toBeGreaterThan(0);
    expect(Array.isArray(body.users)).toBe(true);
  });

  it("GET /admin/users/{id} rejects unauthenticated and non-admin, and audits an admin read", async () => {
    const target = await createUser();

    const unauth = await getUserRoute(
      request("GET", `/api/v1/admin/users/${target}`),
      routeParams(target),
    );
    expect(unauth.status).toBe(401);

    const plainUser = await createUser();
    const plainCookie = await loginCookie(plainUser);
    const forbidden = await getUserRoute(
      request("GET", `/api/v1/admin/users/${target}`, plainCookie),
      routeParams(target),
    );
    expect(forbidden.status).toBe(403);

    const adminId = await createUser(["ADMIN"]);
    const adminCookie = await loginCookie(adminId);
    const ok = await getUserRoute(
      request("GET", `/api/v1/admin/users/${target}`, adminCookie),
      routeParams(target),
    );
    expect(ok.status).toBe(200);

    const { rows } = await pool.query(
      "SELECT * FROM audit_events WHERE action = 'ADMIN_USER_READ' AND entity_id = $1",
      [target],
    );
    expect(rows).toHaveLength(1);
  });

  it("POST /admin/users/{id}/suspend rejects unauthenticated, non-admin, and admin without step-up", async () => {
    const target = await createUser();

    const unauth = await suspendRoute(
      request("POST", `/api/v1/admin/users/${target}/suspend`),
      routeParams(target),
    );
    expect(unauth.status).toBe(401);

    const plainUser = await createUser();
    const plainCookie = await loginCookie(plainUser, { stepUpAt: new Date() });
    const forbidden = await suspendRoute(
      request("POST", `/api/v1/admin/users/${target}/suspend`, plainCookie),
      routeParams(target),
    );
    expect(forbidden.status).toBe(403);

    const adminId = await createUser(["ADMIN"]);
    const noStepUpCookie = await loginCookie(adminId);
    const mfaRequired = await suspendRoute(
      request("POST", `/api/v1/admin/users/${target}/suspend`, noStepUpCookie),
      routeParams(target),
    );
    expect(mfaRequired.status).toBe(401);
    const body = (await mfaRequired.json()) as { error: { code: string } };
    expect(body.error.code).toBe("MFA_REQUIRED");
  });

  it("suspends then restores a user with a fresh step-up, recording one audit event each", async () => {
    const target = await createUser();
    const adminId = await createUser(["ADMIN"]);
    const cookie = await loginCookie(adminId, { stepUpAt: new Date() });

    const suspendResponse = await suspendRoute(
      request("POST", `/api/v1/admin/users/${target}/suspend`, cookie),
      routeParams(target),
    );
    expect(suspendResponse.status).toBe(200);
    const suspendBody = (await suspendResponse.json()) as { user: { status: string } };
    expect(suspendBody.user.status).toBe("SUSPENDED");

    const restoreResponse = await restoreRoute(
      request("POST", `/api/v1/admin/users/${target}/restore`, cookie),
      routeParams(target),
    );
    expect(restoreResponse.status).toBe(200);
    const restoreBody = (await restoreResponse.json()) as { user: { status: string } };
    expect(restoreBody.user.status).toBe("ACTIVE");

    const { rows: suspendEvents } = await pool.query(
      "SELECT * FROM audit_events WHERE action = 'USER_SUSPENDED' AND entity_id = $1",
      [target],
    );
    expect(suspendEvents).toHaveLength(1);
    const { rows: restoreEvents } = await pool.query(
      "SELECT * FROM audit_events WHERE action = 'USER_RESTORED' AND entity_id = $1",
      [target],
    );
    expect(restoreEvents).toHaveLength(1);
  });

  it("rejects restoring an ACTIVE user with 409 INVALID_STATE_TRANSITION", async () => {
    const target = await createUser();
    const adminId = await createUser(["ADMIN"]);
    const cookie = await loginCookie(adminId, { stepUpAt: new Date() });

    const response = await restoreRoute(
      request("POST", `/api/v1/admin/users/${target}/restore`, cookie),
      routeParams(target),
    );
    expect(response.status).toBe(409);
  });
});
