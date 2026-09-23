import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleAuditEventRepository } from "@/infra/db/repositories/audit-event-repository";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

/**
 * T-907 AC ("every mutating action findable"): each audited use case across the app writes
 * exactly one row through the same `AuditWriter.record` port (see e.g.
 * tests/integration/app/admin-users-routes.test.ts asserting `USER_SUSPENDED`/`ADMIN_USER_READ`
 * rows exist) — this suite proves the *search* side finds rows by every documented filter
 * (actor, action, entity, date range) and paginates correctly, which is what T-907 actually adds.
 */
describe("DrizzleAuditEventRepository", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function insertEvent(overrides: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    createdAt?: Date;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO audit_events (id, actor_type, actor_id, action, entity_type, entity_id, created_at)
       VALUES ($1, 'admin', $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        overrides.actorId ?? null,
        overrides.action,
        overrides.entityType,
        overrides.entityId,
        overrides.createdAt ?? new Date(),
      ],
    );
  }

  it("filters by action, entity type/id, actor, and date range", async () => {
    const actorId = randomUUID();
    const entityId = randomUUID();
    await insertEvent({ actorId, action: "USER_SUSPENDED", entityType: "user", entityId });
    await insertEvent({
      actorId: randomUUID(),
      action: "MARKET_CREATED",
      entityType: "market",
      entityId: randomUUID(),
    });

    const byAction = await uow.run((tx: DbTx) =>
      new DrizzleAuditEventRepository(tx).search(
        { action: "USER_SUSPENDED" },
        { limit: 20, offset: 0 },
      ),
    );
    expect(byAction.items.some((e) => e.entityId === entityId)).toBe(true);
    expect(byAction.items.every((e) => e.action === "USER_SUSPENDED")).toBe(true);

    const byEntity = await uow.run((tx: DbTx) =>
      new DrizzleAuditEventRepository(tx).search(
        { entityType: "user", entityId },
        { limit: 20, offset: 0 },
      ),
    );
    expect(byEntity.items).toHaveLength(1);

    const byActor = await uow.run((tx: DbTx) =>
      new DrizzleAuditEventRepository(tx).search({ actorId }, { limit: 20, offset: 0 }),
    );
    expect(byActor.items.every((e) => e.actorId === actorId)).toBe(true);
  });

  it("filters by a created-at date range", async () => {
    const entityId = randomUUID();
    await insertEvent({
      action: "MARKET_STATUS_CHANGED",
      entityType: "market",
      entityId,
      createdAt: new Date("2020-01-01T00:00:00Z"),
    });

    const inRange = await uow.run((tx: DbTx) =>
      new DrizzleAuditEventRepository(tx).search(
        { entityId, from: new Date("2019-12-01T00:00:00Z"), to: new Date("2020-02-01T00:00:00Z") },
        { limit: 20, offset: 0 },
      ),
    );
    expect(inRange.items).toHaveLength(1);

    const outOfRange = await uow.run((tx: DbTx) =>
      new DrizzleAuditEventRepository(tx).search(
        { entityId, from: new Date("2021-01-01T00:00:00Z") },
        { limit: 20, offset: 0 },
      ),
    );
    expect(outOfRange.items).toHaveLength(0);
  });

  it("paginates with limit/offset and reports the true total", async () => {
    const entityType = `pagination-${randomUUID()}`;
    for (let i = 0; i < 5; i += 1) {
      await insertEvent({ action: "PAGINATION_TEST", entityType, entityId: randomUUID() });
    }

    const page1 = await uow.run((tx: DbTx) =>
      new DrizzleAuditEventRepository(tx).search({ entityType }, { limit: 2, offset: 0 }),
    );
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page3 = await uow.run((tx: DbTx) =>
      new DrizzleAuditEventRepository(tx).search({ entityType }, { limit: 2, offset: 4 }),
    );
    expect(page3.items).toHaveLength(1);
  });
});
