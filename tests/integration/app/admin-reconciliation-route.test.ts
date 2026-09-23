import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

const { GET: reconciliationRoute } = await import("@/app/api/v1/admin/reconciliation/route");
const { getContainer } = await import("@/platform/http/container");

const APP_URL = "https://app.example.test";

/** Same synthetic-inconsistency technique as tests/invariants/reconcile.test.ts's INV-03 case,
 * duplicated at minimal scope here because this suite proves the *route* surfaces it, not that
 * the invariant queries themselves are correct (already exhaustively covered there). */
async function seedUserWithFaucetCredit(pool: Pool, availableMinor = 100000) {
  const userResult = await pool.query(
    `INSERT INTO users (email, date_of_birth) VALUES ($1, '1990-01-01') RETURNING id`,
    [`admin-reconcile-route-${randomUUID()}@example.test`],
  );
  const userId = userResult.rows[0].id as string;

  await pool.query(
    `INSERT INTO wallets (user_id, currency, available_minor, locked_minor) VALUES ($1, 'PEN', $2, 0)`,
    [userId, availableMinor],
  );

  const txResult = await pool.query(
    `INSERT INTO ledger_transactions
       (kind, reference_type, reference_id, idempotency_key, actor_type, actor_id)
     VALUES ('FAUCET', 'bet_order', $1, $2, 'SYSTEM', NULL)
     RETURNING id`,
    [randomUUID(), `faucet-${randomUUID()}`],
  );
  const transactionId = txResult.rows[0].id as string;

  await pool.query(
    `INSERT INTO ledger_entries (transaction_id, account_key, currency, signed_amount_minor)
     VALUES ($1, $2, 'PEN', $3), ($1, 'SIMULATION_FAUCET', 'PEN', $4)`,
    [transactionId, `USER_AVAILABLE:${userId}`, availableMinor, -availableMinor],
  );

  return { userId };
}

describe("GET /admin/reconciliation (T-908, MET-COV-04)", () => {
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
      [userId, `admin-reconcile-staff-${randomUUID()}@example.test`],
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

  it("rejects unauthenticated with 401 and non-admin, non-auditor with 403", async () => {
    const unauth = await reconciliationRoute(
      new Request(`${APP_URL}/api/v1/admin/reconciliation`, { method: "GET" }),
    );
    expect(unauth.status).toBe(401);

    const plainUser = await createUser();
    const cookie = await loginCookie(plainUser);
    const forbidden = await reconciliationRoute(
      new Request(`${APP_URL}/api/v1/admin/reconciliation`, {
        method: "GET",
        headers: { cookie },
      }),
    );
    expect(forbidden.status).toBe(403);
  });

  it("reports all invariants passing against a clean fixture", async () => {
    await seedUserWithFaucetCredit(pool);
    const adminId = await createUser(["ADMIN"]);
    const cookie = await loginCookie(adminId);

    const response = await reconciliationRoute(
      new Request(`${APP_URL}/api/v1/admin/reconciliation`, {
        method: "GET",
        headers: { cookie },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      results: readonly { id: string; status: string }[];
    };
    expect(body.results.every((r) => r.status === "PASS")).toBe(true);
  });

  it("surfaces an injected INV-03 wallet/ledger desync with the correct invariant id", async () => {
    const { userId } = await seedUserWithFaucetCredit(pool);
    await pool.query(
      `UPDATE wallets SET available_minor = available_minor + 500 WHERE user_id = $1`,
      [userId],
    );

    const adminId = await createUser(["ADMIN"]);
    const cookie = await loginCookie(adminId);
    const notifySpy = vi.spyOn(getContainer().alertNotifier, "notify");

    const response = await reconciliationRoute(
      new Request(`${APP_URL}/api/v1/admin/reconciliation`, {
        method: "GET",
        headers: { cookie },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      results: readonly { id: string; status: string }[];
    };
    const inv03 = body.results.find((r) => r.id === "INV-03");
    expect(inv03?.status).toBe("FAIL");

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "P1",
        code: "RECONCILIATION_FAILURE",
        details: expect.objectContaining({ invariantId: "INV-03" }),
      }),
    );
    notifySpy.mockRestore();
  });
});
