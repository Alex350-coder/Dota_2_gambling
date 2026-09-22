import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleRiskAlertRepository } from "@/infra/db/repositories/risk-alert-repository";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleRiskAlertRepository", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates and finds a risk alert by id", async () => {
    const entityId = randomUUID();

    const created = await uow.run(async (tx: DbTx) =>
      new DrizzleRiskAlertRepository(tx).create({
        id: randomUUID(),
        ruleId: "R-06",
        severity: "MEDIUM",
        entityType: "USER",
        entityId,
        payload: { stakeMinor: "50000", medianMinor: "5000", multiple: 10 },
        createdAt: new Date(),
      }),
    );

    expect(created.ruleId).toBe("R-06");
    expect(created.status).toBe("OPEN");
    expect(created.reviewedBy).toBeNull();

    const found = await uow.run(async (tx: DbTx) =>
      new DrizzleRiskAlertRepository(tx).findById(created.id),
    );
    expect(found?.entityId).toBe(entityId);
    expect(found?.payload).toEqual(created.payload);
  });

  it("filters by rule id, status and entity", async () => {
    const entityId = randomUUID();
    await uow.run(async (tx: DbTx) =>
      new DrizzleRiskAlertRepository(tx).create({
        id: randomUUID(),
        ruleId: "R-08",
        severity: "MEDIUM",
        entityType: "MARKET",
        entityId,
        payload: { reason: "new-account-full-balance" },
        createdAt: new Date(),
      }),
    );

    const byRule = await uow.run(async (tx: DbTx) =>
      new DrizzleRiskAlertRepository(tx).list({ ruleId: "R-08" }),
    );
    expect(byRule.some((a) => a.entityId === entityId)).toBe(true);

    const byEntity = await uow.run(async (tx: DbTx) =>
      new DrizzleRiskAlertRepository(tx).list({ entityType: "MARKET", entityId }),
    );
    expect(byEntity).toHaveLength(1);

    const byStatus = await uow.run(async (tx: DbTx) =>
      new DrizzleRiskAlertRepository(tx).list({ status: "CLOSED" }),
    );
    expect(byStatus.every((a) => a.status === "CLOSED")).toBe(true);
  });

  it("counts open alerts", async () => {
    const before = await uow.run(async (tx: DbTx) =>
      new DrizzleRiskAlertRepository(tx).countOpen(),
    );

    await uow.run(async (tx: DbTx) =>
      new DrizzleRiskAlertRepository(tx).create({
        id: randomUUID(),
        ruleId: "R-11",
        severity: "CRITICAL",
        entityType: "MARKET",
        entityId: randomUUID(),
        payload: { invariant: "INV-06" },
        createdAt: new Date(),
      }),
    );

    const after = await uow.run(async (tx: DbTx) => new DrizzleRiskAlertRepository(tx).countOpen());
    expect(after).toBe(before + 1);
  });

  it("returns null for an unknown id", async () => {
    const found = await uow.run(async (tx: DbTx) =>
      new DrizzleRiskAlertRepository(tx).findById(randomUUID()),
    );
    expect(found).toBeNull();
  });
});
