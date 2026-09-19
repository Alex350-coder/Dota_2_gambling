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
import { RevokeAllSessionsUseCase } from "@/application/identity/revoke-all-sessions";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { DomainError } from "@/domain/errors";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("list-sessions + revoke-session", () => {
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

  const revokeAllSessions = new RevokeAllSessionsUseCase<DbTx>({
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
      [userId, `sessions-${randomUUID()}@example.test`],
    );
    return userId;
  }

  it("lists only the caller's own active sessions", async () => {
    const userId = await createUser();
    const otherUserId = await createUser();

    const { session: mine } = await sessionService.createSession({
      userId,
      ip: null,
      userAgent: "vitest",
    });
    await sessionService.createSession({ userId: otherUserId, ip: null, userAgent: "vitest" });

    const result = await listSessions.execute({ userId });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(mine.id);
  });

  it("excludes revoked sessions from the list", async () => {
    const userId = await createUser();
    const { session } = await sessionService.createSession({
      userId,
      ip: null,
      userAgent: null,
    });

    await sessionService.revokeSession(session.id);

    const result = await listSessions.execute({ userId });
    expect(result.find((s) => s.id === session.id)).toBeUndefined();
  });

  it("revokes the caller's own session, invalidating its token", async () => {
    const userId = await createUser();
    const { token, session } = await sessionService.createSession({
      userId,
      ip: null,
      userAgent: null,
    });

    await revokeSession.execute({ userId, sessionId: session.id });

    await expect(sessionService.validateSession(token)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });

  it("refuses to revoke another user's session, reporting RESOURCE_NOT_FOUND", async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const { session } = await sessionService.createSession({
      userId: owner,
      ip: null,
      userAgent: null,
    });

    await expect(
      revokeSession.execute({ userId: attacker, sessionId: session.id }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });

    const active = await listSessions.execute({ userId: owner });
    expect(active.find((s) => s.id === session.id)).toBeDefined();
  });

  it("reports RESOURCE_NOT_FOUND for an unknown session id", async () => {
    const userId = await createUser();

    await expect(revokeSession.execute({ userId, sessionId: randomUUID() })).rejects.toBeInstanceOf(
      DomainError,
    );
  });

  it("emits exactly one SESSION_REVOKED audit event", async () => {
    const userId = await createUser();
    const { session } = await sessionService.createSession({ userId, ip: null, userAgent: null });

    await revokeSession.execute({ userId, sessionId: session.id });

    const rows = await pool
      .query(
        "SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'SESSION_REVOKED'",
        [session.id],
      )
      .then((r) => r.rows);
    expect(rows).toHaveLength(1);
  });

  it("revokes every other session but keeps the caller's own alive", async () => {
    const userId = await createUser();
    const { token: keptToken, session: keptSession } = await sessionService.createSession({
      userId,
      ip: null,
      userAgent: null,
    });
    const { token: otherTokenA } = await sessionService.createSession({
      userId,
      ip: null,
      userAgent: null,
    });
    const { token: otherTokenB } = await sessionService.createSession({
      userId,
      ip: null,
      userAgent: null,
    });

    await revokeAllSessions.execute({ userId, exceptSessionId: keptSession.id });

    await expect(sessionService.validateSession(keptToken)).resolves.toBeDefined();
    await expect(sessionService.validateSession(otherTokenA)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
    await expect(sessionService.validateSession(otherTokenB)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });

  it("does not revoke another user's sessions", async () => {
    const userId = await createUser();
    const otherUserId = await createUser();
    const { session: keptSession } = await sessionService.createSession({
      userId,
      ip: null,
      userAgent: null,
    });
    const { token: otherUserToken } = await sessionService.createSession({
      userId: otherUserId,
      ip: null,
      userAgent: null,
    });

    await revokeAllSessions.execute({ userId, exceptSessionId: keptSession.id });

    await expect(sessionService.validateSession(otherUserToken)).resolves.toBeDefined();
  });

  it("emits exactly one ALL_OTHER_SESSIONS_REVOKED audit event", async () => {
    const userId = await createUser();
    const { session } = await sessionService.createSession({ userId, ip: null, userAgent: null });

    await revokeAllSessions.execute({ userId, exceptSessionId: session.id });

    const rows = await pool
      .query(
        "SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'ALL_OTHER_SESSIONS_REVOKED'",
        [userId],
      )
      .then((r) => r.rows);
    expect(rows).toHaveLength(1);
  });
});
