import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleRgLimitRepository } from "@/infra/db/repositories/rg-limit-repository";
import { ListLimitsUseCase, UpdateLimitUseCase } from "@/application/compliance";
import { DEFAULT_LIMITS } from "@/domain/compliance";
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

describe("ListLimitsUseCase / UpdateLimitUseCase (T-812)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const clock = new TestClock(new Date("2026-01-01T00:00:00.000Z"));

  const rgLimits = (tx: DbTx, ownerId: string) => new DrizzleRgLimitRepository(tx, ownerId);

  const listLimits = new ListLimitsUseCase<DbTx>({ uow, rgLimits, clock });
  const updateLimit = new UpdateLimitUseCase<DbTx>({ uow, rgLimits, clock });

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createUser(): Promise<string> {
    const userId = randomUUID();
    await pool.query(
      "INSERT INTO users (id, email, status, date_of_birth) VALUES ($1, $2, 'ACTIVE', '1990-01-01')",
      [userId, `player-${randomUUID()}@example.test`],
    );
    return userId;
  }

  it("returns every DEFAULT_LIMITS entry for a brand-new user with no persisted rows", async () => {
    const userId = await createUser();

    const limits = await listLimits.execute({ userId });

    expect(limits).toHaveLength(DEFAULT_LIMITS.length);
    for (const defaultLimit of DEFAULT_LIMITS) {
      const row = limits.find(
        (limit) => limit.kind === defaultLimit.kind && limit.period === defaultLimit.period,
      );
      expect(row).toBeDefined();
      expect(row?.currentValue).toBe(defaultLimit.value);
      expect(row?.pendingValue).toBeNull();
      expect(row?.effectiveValue).toBe(defaultLimit.value);
    }
  });

  it("lowering a limit applies immediately and is reflected on the next list", async () => {
    const userId = await createUser();

    const updated = await updateLimit.execute({
      userId,
      kind: "STAKE",
      period: "DAY",
      value: 50_000n,
    });

    expect(updated.currentValue).toBe(50_000n);
    expect(updated.pendingValue).toBeNull();
    expect(updated.effectiveValue).toBe(50_000n);

    const limits = await listLimits.execute({ userId });
    const row = limits.find((limit) => limit.kind === "STAKE" && limit.period === "DAY");
    expect(row?.currentValue).toBe(50_000n);
    expect(row?.effectiveValue).toBe(50_000n);
  });

  it("raising a limit defers 24h — effective value stays at the lower current value until then", async () => {
    const userId = await createUser();

    const updated = await updateLimit.execute({
      userId,
      kind: "STAKE",
      period: "DAY",
      value: 200_000n,
    });

    expect(updated.currentValue).toBe(100_000n);
    expect(updated.pendingValue).toBe(200_000n);
    expect(updated.effectiveAt).not.toBeNull();
    expect(updated.effectiveValue).toBe(100_000n);

    const beforeCooloff = await listLimits.execute({ userId });
    const rowBefore = beforeCooloff.find(
      (limit) => limit.kind === "STAKE" && limit.period === "DAY",
    );
    expect(rowBefore?.effectiveValue).toBe(100_000n);

    clock.set(new Date(clock.now().getTime() + 25 * 60 * 60 * 1_000));

    const afterCooloff = await listLimits.execute({ userId });
    const rowAfter = afterCooloff.find((limit) => limit.kind === "STAKE" && limit.period === "DAY");
    expect(rowAfter?.effectiveValue).toBe(200_000n);

    clock.set(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("rejects an invalid (kind, period) pairing", async () => {
    const userId = await createUser();

    await expect(
      updateLimit.execute({ userId, kind: "STAKE", period: "SESSION", value: 1_000n }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
