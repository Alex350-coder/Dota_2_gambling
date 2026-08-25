import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleBetSlipRepository } from "@/infra/db/repositories/bet-slip-repository";
import { DomainError } from "@/domain/errors";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleBetSlipRepository", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);

  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    const [userA, userB] = await Promise.all([
      pool.query(
        `INSERT INTO users (email, date_of_birth) VALUES ($1, '1990-01-01') RETURNING id`,
        [`slip-owner-a-${randomUUID()}@example.test`],
      ),
      pool.query(
        `INSERT INTO users (email, date_of_birth) VALUES ($1, '1990-01-01') RETURNING id`,
        [`slip-owner-b-${randomUUID()}@example.test`],
      ),
    ]);
    userAId = userA.rows[0].id as string;
    userBId = userB.rows[0].id as string;
  });

  it("creates a bet slip for the owner", async () => {
    const now = new Date();
    const slip = await uow.run((tx: DbTx) =>
      new DrizzleBetSlipRepository(tx, userAId).create({
        id: randomUUID(),
        userId: userAId,
        createdAt: now,
      }),
    );

    expect(slip.userId).toBe(userAId);
  });

  it("refuses to create a bet slip for a different owner", async () => {
    await expect(
      uow.run((tx: DbTx) =>
        new DrizzleBetSlipRepository(tx, userBId).create({
          id: randomUUID(),
          userId: userAId,
          createdAt: new Date(),
        }),
      ),
    ).rejects.toThrow(DomainError);
  });
});
