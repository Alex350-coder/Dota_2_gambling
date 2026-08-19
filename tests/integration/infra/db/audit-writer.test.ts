import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork } from "@/infra/db/uow";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("DrizzleAuditWriter", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const audit = new DrizzleAuditWriter();

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createUser(): Promise<string> {
    const result = await pool.query(
      "INSERT INTO users (email, date_of_birth) VALUES ($1, $2) RETURNING id",
      [`audit-${randomUUID()}@example.test`, "1990-01-01"],
    );
    return result.rows[0].id as string;
  }

  it("inserts one row into audit_events with the given fields", async () => {
    const userId = await createUser();

    await uow.run((tx) =>
      audit.record(tx, {
        actorType: "user",
        actorId: userId,
        action: "USER_REGISTERED",
        entityType: "user",
        entityId: userId,
        ipHash: "hashed-ip",
        userAgent: "vitest",
        requestId: "req-1",
      }),
    );

    const rows = await pool
      .query(
        "SELECT actor_type, actor_id, action, entity_type, entity_id, ip_hash, user_agent, request_id FROM audit_events WHERE entity_id = $1",
        [userId],
      )
      .then((r) => r.rows);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_type: "user",
      actor_id: userId,
      action: "USER_REGISTERED",
      entity_type: "user",
      entity_id: userId,
      ip_hash: "hashed-ip",
      user_agent: "vitest",
      request_id: "req-1",
    });
  });

  it("defaults optional fields to null when omitted", async () => {
    const userId = await createUser();

    await uow.run((tx) =>
      audit.record(tx, {
        actorType: "system",
        actorId: null,
        action: "RATE_LIMIT_BREACH",
        entityType: "user",
        entityId: userId,
      }),
    );

    const rows = await pool
      .query(
        "SELECT actor_id, ip_hash, user_agent, request_id FROM audit_events WHERE entity_id = $1",
        [userId],
      )
      .then((r) => r.rows);

    expect(rows[0].actor_id).toBeNull();
    expect(rows[0].ip_hash).toBeNull();
    expect(rows[0].user_agent).toBeNull();
    expect(rows[0].request_id).toBeNull();
  });

  it("rolls back the audit row if the enclosing transaction rolls back", async () => {
    const userId = await createUser();

    await expect(
      uow.run(async (tx) => {
        await audit.record(tx, {
          actorType: "user",
          actorId: userId,
          action: "SHOULD_NOT_PERSIST",
          entityType: "user",
          entityId: userId,
        });
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");

    const rows = await pool
      .query("SELECT 1 FROM audit_events WHERE entity_id = $1 AND action = 'SHOULD_NOT_PERSIST'", [
        userId,
      ])
      .then((r) => r.rows);
    expect(rows).toHaveLength(0);
  });
});
