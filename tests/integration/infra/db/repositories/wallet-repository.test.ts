import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleWalletRepository } from "@/infra/db/repositories/wallet-repository";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleWalletRepository", () => {
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
        [`wallet-owner-a-${randomUUID()}@example.test`],
      ),
      pool.query(
        `INSERT INTO users (email, date_of_birth) VALUES ($1, '1990-01-01') RETURNING id`,
        [`wallet-owner-b-${randomUUID()}@example.test`],
      ),
    ]);
    userAId = userA.rows[0].id as string;
    userBId = userB.rows[0].id as string;

    await pool.query(
      `INSERT INTO wallets (user_id, currency, available_minor, locked_minor) VALUES ($1, 'PEN', 5000, 1000)`,
      [userAId],
    );
    await pool.query(
      `INSERT INTO wallets (user_id, currency, available_minor, locked_minor) VALUES ($1, 'PEN', 9000, 0)`,
      [userBId],
    );
  });

  it("returns the owner's wallet for the requested currency", async () => {
    const wallet = await uow.run((tx: DbTx) =>
      new DrizzleWalletRepository(tx, userAId).findByCurrency("PEN"),
    );

    expect(wallet).not.toBeNull();
    expect(wallet?.userId).toBe(userAId);
    expect(wallet?.availableMinor).toBe(5000n);
    expect(wallet?.lockedMinor).toBe(1000n);
  });

  it("returns null when the owner has no wallet in that currency", async () => {
    const wallet = await uow.run((tx: DbTx) =>
      new DrizzleWalletRepository(tx, userAId).findByCurrency("USD"),
    );

    expect(wallet).toBeNull();
  });

  it("never returns another user's wallet (cross-user isolation)", async () => {
    const walletA = await uow.run((tx: DbTx) =>
      new DrizzleWalletRepository(tx, userAId).findByCurrency("PEN"),
    );

    expect(walletA?.userId).toBe(userAId);
    expect(walletA?.availableMinor).not.toBe(9000n);

    const walletB = await uow.run((tx: DbTx) =>
      new DrizzleWalletRepository(tx, userBId).findByCurrency("PEN"),
    );
    expect(walletB?.userId).toBe(userBId);
    expect(walletB?.availableMinor).toBe(9000n);
  });
});
