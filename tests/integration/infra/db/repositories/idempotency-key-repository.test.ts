import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleIdempotencyKeyRepository } from "@/infra/db/repositories/idempotency-key-repository";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleIdempotencyKeyRepository", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);

  let userId: string;

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    const result = await pool.query(
      `INSERT INTO users (email, date_of_birth) VALUES ($1, '1990-01-01') RETURNING id`,
      [`idempotency-owner-${randomUUID()}@example.test`],
    );
    userId = result.rows[0].id as string;
  });

  it("creates a row the first time and reports the win", async () => {
    const won = await uow.run((tx: DbTx) =>
      new DrizzleIdempotencyKeyRepository(tx).tryCreate({
        userId,
        route: "POST /bets",
        key: "key-1",
        requestHash: "hash-1",
      }),
    );

    expect(won).toBe(true);
  });

  it("reports losing the race on a duplicate (userId, route, key)", async () => {
    await uow.run((tx: DbTx) =>
      new DrizzleIdempotencyKeyRepository(tx).tryCreate({
        userId,
        route: "POST /bets",
        key: "key-2",
        requestHash: "hash-2",
      }),
    );

    const wonSecondTime = await uow.run((tx: DbTx) =>
      new DrizzleIdempotencyKeyRepository(tx).tryCreate({
        userId,
        route: "POST /bets",
        key: "key-2",
        requestHash: "some-other-hash",
      }),
    );

    expect(wonSecondTime).toBe(false);
  });

  it("finds a stored row by (userId, route, key)", async () => {
    await uow.run((tx: DbTx) =>
      new DrizzleIdempotencyKeyRepository(tx).tryCreate({
        userId,
        route: "POST /bets",
        key: "key-3",
        requestHash: "hash-3",
      }),
    );

    const record = await uow.run((tx: DbTx) =>
      new DrizzleIdempotencyKeyRepository(tx).findByKey(userId, "POST /bets", "key-3"),
    );

    expect(record).not.toBeNull();
    expect(record?.requestHash).toBe("hash-3");
    expect(record?.responseStatus).toBeNull();
    expect(record?.responseBody).toBeNull();
  });

  it("returns null when no row matches", async () => {
    const record = await uow.run((tx: DbTx) =>
      new DrizzleIdempotencyKeyRepository(tx).findByKey(userId, "POST /bets", "missing"),
    );

    expect(record).toBeNull();
  });

  it("persists the cached response for later replay", async () => {
    await uow.run((tx: DbTx) =>
      new DrizzleIdempotencyKeyRepository(tx).tryCreate({
        userId,
        route: "POST /bets",
        key: "key-4",
        requestHash: "hash-4",
      }),
    );

    await uow.run((tx: DbTx) =>
      new DrizzleIdempotencyKeyRepository(tx).updateResponse(userId, "POST /bets", "key-4", 201, {
        orderId: "order-1",
      }),
    );

    const record = await uow.run((tx: DbTx) =>
      new DrizzleIdempotencyKeyRepository(tx).findByKey(userId, "POST /bets", "key-4"),
    );

    expect(record?.responseStatus).toBe(201);
    expect(record?.responseBody).toEqual({ orderId: "order-1" });
  });
});
