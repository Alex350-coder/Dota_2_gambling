import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleSessionRepository } from "@/infra/db/repositories/session-repository";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { SessionService } from "@/platform/session/service";
import { DomainError } from "@/domain/errors";
import type { Clock } from "@/domain/ports";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  advanceHours(hours: number): void {
    this.current = new Date(this.current.getTime() + hours * 60 * 60 * 1000);
  }
}

describe("SessionService", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const clock = new FixedClock(new Date("2026-01-01T00:00:00Z"));

  const sessionService = new SessionService<DbTx>({
    uow,
    sessions: (tx) => new DrizzleSessionRepository(tx),
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
      [userId, `session-${randomUUID()}@example.test`],
    );
    return userId;
  }

  it("creates a session and immediately validates the raw token", async () => {
    const userId = await createUser();

    const { token, session } = await sessionService.createSession({
      userId,
      ip: "203.0.113.1",
      userAgent: "vitest",
    });

    const validated = await sessionService.validateSession(token);
    expect(validated.id).toBe(session.id);
    expect(validated.userId).toBe(userId);
  });

  it("never persists the raw token, only its hash", async () => {
    const userId = await createUser();
    const { token } = await sessionService.createSession({ userId, ip: null, userAgent: null });

    const row = await pool
      .query("SELECT token_hash FROM sessions WHERE user_id = $1", [userId])
      .then((r) => r.rows[0] as { token_hash: string });

    expect(row.token_hash).not.toBe(token);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects an unknown token with UNAUTHENTICATED", async () => {
    await expect(sessionService.validateSession("not-a-real-token")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("rejects a revoked session with SESSION_EXPIRED", async () => {
    const userId = await createUser();
    const { token, session } = await sessionService.createSession({
      userId,
      ip: null,
      userAgent: null,
    });

    await sessionService.revokeSession(session.id);

    await expect(sessionService.validateSession(token)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });

  it("rejects a session past its absolute lifetime", async () => {
    const shortLived = new SessionService<DbTx>({
      uow,
      sessions: (tx) => new DrizzleSessionRepository(tx),
      ids,
      clock,
      config: { ttlHours: 1, idleTimeoutHours: 168 },
    });
    const userId = await createUser();
    const { token } = await shortLived.createSession({ userId, ip: null, userAgent: null });

    const laterClock = new FixedClock(new Date(clock.now().getTime() + 2 * 60 * 60 * 1000));
    const laterService = new SessionService<DbTx>({
      uow,
      sessions: (tx) => new DrizzleSessionRepository(tx),
      ids,
      clock: laterClock,
      config: { ttlHours: 1, idleTimeoutHours: 168 },
    });

    await expect(laterService.validateSession(token)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });

  it("rejects a session that has been idle past the idle timeout", async () => {
    const idleClock = new FixedClock(new Date("2026-02-01T00:00:00Z"));
    const idleService = new SessionService<DbTx>({
      uow,
      sessions: (tx) => new DrizzleSessionRepository(tx),
      ids,
      clock: idleClock,
      config: { ttlHours: 720, idleTimeoutHours: 24 },
    });
    const userId = await createUser();
    const { token } = await idleService.createSession({ userId, ip: null, userAgent: null });

    idleClock.advanceHours(25);

    await expect(idleService.validateSession(token)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });

  it("touchSession extends the idle window", async () => {
    const idleClock = new FixedClock(new Date("2026-03-01T00:00:00Z"));
    const idleService = new SessionService<DbTx>({
      uow,
      sessions: (tx) => new DrizzleSessionRepository(tx),
      ids,
      clock: idleClock,
      config: { ttlHours: 720, idleTimeoutHours: 24 },
    });
    const userId = await createUser();
    const { token, session } = await idleService.createSession({
      userId,
      ip: null,
      userAgent: null,
    });

    idleClock.advanceHours(20);
    await idleService.touchSession(session.id);
    idleClock.advanceHours(20);

    const validated = await idleService.validateSession(token);
    expect(validated.id).toBe(session.id);
  });

  it("propagates DomainError instances, not raw errors", async () => {
    await expect(sessionService.validateSession("bogus")).rejects.toBeInstanceOf(DomainError);
  });
});
