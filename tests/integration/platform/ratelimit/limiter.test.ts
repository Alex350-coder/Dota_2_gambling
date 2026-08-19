import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { RateLimiter } from "@/infra/db/rate-limiter";
import { CryptoIdGenerator } from "@/infra/id-generator";
import type { Clock } from "@/domain/ports";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

describe("RateLimiter", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const clock = new FixedClock(new Date("2026-01-01T00:00:00Z"));
  const limiter = new RateLimiter(clock, ids);

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
      [userId, `ratelimit-${randomUUID()}@example.test`],
    );
    return userId;
  }

  it("allows requests under the class limit", async () => {
    const ipHash = randomUUID();
    for (let i = 0; i < 5; i += 1) {
      const result = await uow.run((tx: DbTx) =>
        limiter.check(tx, { rateLimitClass: "public", userId: null, ipHash }),
      );
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks requests once the class limit is exceeded and returns a positive retryAfterSeconds", async () => {
    const ipHash = randomUUID();
    let lastResult;
    for (let i = 0; i < 11; i += 1) {
      lastResult = await uow.run((tx: DbTx) =>
        limiter.check(tx, { rateLimitClass: "auth-strict", userId: null, ipHash }),
      );
    }
    expect(lastResult?.allowed).toBe(false);
    expect(lastResult?.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window elapses", async () => {
    const ipHash = randomUUID();
    for (let i = 0; i < 10; i += 1) {
      await uow.run((tx: DbTx) =>
        limiter.check(tx, { rateLimitClass: "auth-strict", userId: null, ipHash }),
      );
    }
    const blocked = await uow.run((tx: DbTx) =>
      limiter.check(tx, { rateLimitClass: "auth-strict", userId: null, ipHash }),
    );
    expect(blocked.allowed).toBe(false);

    clock.advance(61_000);

    const afterReset = await uow.run((tx: DbTx) =>
      limiter.check(tx, { rateLimitClass: "auth-strict", userId: null, ipHash }),
    );
    expect(afterReset.allowed).toBe(true);
  });

  it("emits exactly one audit event when an authenticated caller breaches the limit", async () => {
    const userId = await createUser();
    for (let i = 0; i < 30; i += 1) {
      await uow.run((tx: DbTx) =>
        limiter.check(tx, { rateLimitClass: "auth-strict", userId, ipHash: "irrelevant" }),
      );
    }

    const { rows } = await pool.query(
      "SELECT count(*)::int AS count FROM audit_events WHERE action = 'RATE_LIMIT_BREACH' AND entity_id = $1",
      [userId],
    );
    expect(rows[0].count).toBe(1);
  });

  it("does not emit an audit event for an unauthenticated breach", async () => {
    const ipHash = randomUUID();
    for (let i = 0; i < 15; i += 1) {
      await uow.run((tx: DbTx) =>
        limiter.check(tx, { rateLimitClass: "auth-strict", userId: null, ipHash }),
      );
    }

    const { rows } = await pool.query(
      "SELECT count(*)::int AS count FROM audit_events WHERE action = 'RATE_LIMIT_BREACH' AND ip_hash = $1",
      [ipHash],
    );
    expect(rows[0].count).toBe(0);
  });
});
