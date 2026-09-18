import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleUserRepository } from "@/infra/db/repositories/user-repository";
import { DrizzleSelfExclusionRepository } from "@/infra/db/repositories/self-exclusion-repository";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { SelfExcludeUseCase, AdminUpdateUserStatusUseCase } from "@/application/compliance";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

class TestClock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  set(date: Date): void {
    this.current = date;
  }
}

describe("SelfExcludeUseCase / AdminUpdateUserStatusUseCase (T-810)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const audit = new DrizzleAuditWriter();
  const clock = new TestClock(new Date("2026-01-01T00:00:00.000Z"));

  const users = (tx: DbTx) => new DrizzleUserRepository(tx);
  const selfExclusions = (tx: DbTx, ownerId: string) =>
    new DrizzleSelfExclusionRepository(tx, ownerId);

  const selfExclude = new SelfExcludeUseCase<DbTx>({
    uow,
    users,
    selfExclusions,
    ids,
    clock,
    audit,
  });
  const adminUpdateUserStatus = new AdminUpdateUserStatusUseCase<DbTx>({
    uow,
    users,
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
      [userId, `player-${randomUUID()}@example.test`],
    );
    return userId;
  }

  it("sets status = SELF_EXCLUDED with a future revocableAt for a time-boxed period", async () => {
    const userId = await createUser();

    const result = await selfExclude.execute({ userId, period: "7D" });

    expect(result.revocableAt).not.toBeNull();
    expect(result.revocableAt?.getTime()).toBeGreaterThan(clock.now().getTime());

    const row = await pool
      .query("SELECT status, revocable_at FROM users WHERE id = $1", [userId])
      .then((r) => r.rows[0] as { status: string; revocable_at: Date });
    expect(row.status).toBe("SELF_EXCLUDED");
    expect(row.revocable_at.toISOString()).toBe(result.revocableAt?.toISOString());

    const history = await pool
      .query("SELECT period FROM self_exclusions WHERE user_id = $1", [userId])
      .then((r) => r.rows as { period: string }[]);
    expect(history).toHaveLength(1);
    expect(history[0]?.period).toBe("7D");
  });

  it("sets revocableAt = null for a PERMANENT self-exclusion", async () => {
    const userId = await createUser();

    const result = await selfExclude.execute({ userId, period: "PERMANENT" });

    expect(result.revocableAt).toBeNull();
    const row = await pool
      .query("SELECT revocable_at FROM users WHERE id = $1", [userId])
      .then((r) => r.rows[0] as { revocable_at: Date | null });
    expect(row.revocable_at).toBeNull();
  });

  it("rejects an admin attempt to change status before revocableAt, and audit-logs the attempt", async () => {
    const userId = await createUser();
    await selfExclude.execute({ userId, period: "30D" });

    await expect(
      adminUpdateUserStatus.execute({ adminId: randomUUID(), userId, status: "ACTIVE" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED_OPERATION" });

    const row = await pool
      .query("SELECT status FROM users WHERE id = $1", [userId])
      .then((r) => r.rows[0] as { status: string });
    expect(row.status).toBe("SELF_EXCLUDED");

    const events = await pool
      .query("SELECT action FROM audit_events WHERE entity_id = $1 ORDER BY created_at", [userId])
      .then((r) => r.rows as { action: string }[]);
    expect(events.map((e) => e.action)).toContain("SELF_EXCLUSION_SHORTEN_REJECTED");
  });

  it("rejects an admin attempt to change a permanently self-excluded account's status", async () => {
    const userId = await createUser();
    await selfExclude.execute({ userId, period: "PERMANENT" });

    await expect(
      adminUpdateUserStatus.execute({ adminId: randomUUID(), userId, status: "ACTIVE" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED_OPERATION" });
  });

  it("allows an admin status change once revocableAt has passed", async () => {
    const userId = await createUser();
    await selfExclude.execute({ userId, period: "24H" });

    clock.set(new Date(clock.now().getTime() + 25 * 60 * 60 * 1_000));

    await adminUpdateUserStatus.execute({ adminId: randomUUID(), userId, status: "ACTIVE" });

    const row = await pool
      .query("SELECT status FROM users WHERE id = $1", [userId])
      .then((r) => r.rows[0] as { status: string });
    expect(row.status).toBe("ACTIVE");

    clock.set(new Date("2026-01-01T00:00:00.000Z"));
  });
});
