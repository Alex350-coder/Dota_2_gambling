import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleSessionRepository } from "@/infra/db/repositories/session-repository";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { SystemClock } from "@/infra/clock";
import { SessionService } from "@/platform/session/service";
import { ListSessionsUseCase } from "@/application/identity/list-sessions";
import { RevokeSessionUseCase } from "@/application/identity/revoke-session";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";
import { expectCrossUserIsolation } from "./harness";

describe("cross-user isolation: session revocation", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();
  const audit = new DrizzleAuditWriter();

  const sessionService = new SessionService<DbTx>({
    uow,
    sessions: (tx) => new DrizzleSessionRepository(tx),
    ids,
    clock,
    config: { ttlHours: 720, idleTimeoutHours: 168 },
  });

  const listSessions = new ListSessionsUseCase<DbTx>({
    uow,
    sessions: (tx) => new DrizzleSessionRepository(tx),
    clock,
  });

  const revokeSession = new RevokeSessionUseCase<DbTx>({
    uow,
    sessions: (tx) => new DrizzleSessionRepository(tx),
    clock,
    audit,
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
      [userId, `isolation-${randomUUID()}@example.test`],
    );
    return userId;
  }

  it("reports RESOURCE_NOT_FOUND when an attacker revokes another user's session", async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const { session } = await sessionService.createSession({
      userId: owner,
      ip: null,
      userAgent: null,
    });

    await expectCrossUserIsolation({
      owner,
      attacker,
      resourceId: session.id,
      attempt: (actingUserId, resourceId) =>
        revokeSession.execute({ userId: actingUserId, sessionId: resourceId }),
    });

    const active = await listSessions.execute({ userId: owner });
    expect(active.find((s) => s.id === session.id)).toBeDefined();
  });
});
