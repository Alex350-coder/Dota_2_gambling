import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleSessionRepository } from "@/infra/db/repositories/session-repository";
import { DrizzleUserRepository } from "@/infra/db/repositories/user-repository";
import { DrizzleUserRoleRepository } from "@/infra/db/repositories/user-role-repository";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { SystemClock } from "@/infra/clock";
import { SessionService } from "@/platform/session";
import { authorize } from "@/platform/authz";
import { DomainError } from "@/domain/errors";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("authorize", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();

  const sessionService = new SessionService<DbTx>({
    uow,
    sessions: (tx) => new DrizzleSessionRepository(tx),
    ids,
    clock,
    config: { ttlHours: 720, idleTimeoutHours: 168 },
  });

  const deps = {
    sessionService,
    uow,
    users: (tx: DbTx) => new DrizzleUserRepository(tx),
    userRoles: (tx: DbTx) => new DrizzleUserRoleRepository(tx),
  };

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createUser(status = "ACTIVE"): Promise<string> {
    const userId = ids.next();
    await pool.query(
      "INSERT INTO users (id, email, status, date_of_birth) VALUES ($1, $2, $3, '1990-01-01')",
      [userId, `authz-${randomUUID()}@example.test`, status],
    );
    return userId;
  }

  it("rejects a missing token with UNAUTHENTICATED", async () => {
    await expect(
      authorize(deps, { token: undefined, action: "session:list", resource: { ownerId: "x" } }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects an unknown token with UNAUTHENTICATED", async () => {
    await expect(
      authorize(deps, {
        token: "not-a-real-token",
        action: "session:list",
        resource: { ownerId: "x" },
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("allows a USER to act on their own resource", async () => {
    const userId = await createUser();
    const { token } = await sessionService.createSession({ userId, ip: null, userAgent: null });

    const result = await authorize(deps, {
      token,
      action: "session:list",
      resource: { ownerId: userId },
    });

    expect(result.userId).toBe(userId);
    expect(result.roles).toEqual(["USER"]);
  });

  it("rejects a USER acting on another user's resource with UNAUTHORIZED_OPERATION", async () => {
    const userId = await createUser();
    const { token } = await sessionService.createSession({ userId, ip: null, userAgent: null });

    await expect(
      authorize(deps, {
        token,
        action: "session:revoke",
        resource: { ownerId: "someone-else" },
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED_OPERATION" });
  });

  it("blocks a SUSPENDED account with ACCOUNT_SUSPENDED", async () => {
    const userId = await createUser("SUSPENDED");
    const { token } = await sessionService.createSession({ userId, ip: null, userAgent: null });

    await expect(
      authorize(deps, { token, action: "session:list", resource: { ownerId: userId } }),
    ).rejects.toMatchObject({ code: "ACCOUNT_SUSPENDED" });
  });

  it("grants an ADMIN access to another user's resource", async () => {
    const adminId = await createUser();
    await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN')", [adminId]);
    const { token } = await sessionService.createSession({
      userId: adminId,
      ip: null,
      userAgent: null,
    });

    const result = await authorize(deps, {
      token,
      action: "user:suspend",
      resource: { ownerId: "some-other-user" },
    });

    expect(result.roles).toContain("ADMIN");
  });

  it("propagates DomainError instances, not generic errors", async () => {
    try {
      await authorize(deps, {
        token: undefined,
        action: "session:list",
        resource: { ownerId: "x" },
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
    }
  });
});
