import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleUserRepository } from "@/infra/db/repositories/user-repository";
import { DrizzleWalletRepository } from "@/infra/db/repositories/wallet-repository";
import { LedgerService } from "@/infra/db/ledger";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { DomainError } from "@/domain/errors";
import { SimulatedCreditUseCase } from "@/application/wallet/simulated-credit";
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

describe("SimulatedCreditUseCase", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const audit = new DrizzleAuditWriter();
  const clock = new TestClock(new Date("2026-01-01T00:00:00.000Z"));
  const ledger = new LedgerService(ids, clock);
  const users = (tx: DbTx) => new DrizzleUserRepository(tx);
  const wallets = (tx: DbTx, ownerId: string) => new DrizzleWalletRepository(tx, ownerId);

  function buildUseCase(
    overrides: {
      simulatedModeEnabled?: boolean;
      dailyCapMinor?: bigint;
    } = {},
  ) {
    return new SimulatedCreditUseCase<DbTx>({
      uow,
      users,
      wallets,
      ledger,
      ids,
      clock,
      audit,
      simulatedModeEnabled: overrides.simulatedModeEnabled ?? true,
      dailyCapMinor: overrides.dailyCapMinor ?? 100_000n,
    });
  }

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createActiveUser(): Promise<string> {
    const result = await pool.query(
      `INSERT INTO users (email, date_of_birth, status) VALUES ($1, '1990-01-01', 'ACTIVE') RETURNING id`,
      [`credit-user-${randomUUID()}@example.test`],
    );
    return result.rows[0].id as string;
  }

  it("provisions a wallet and credits it from the simulation faucet", async () => {
    const userId = await createActiveUser();

    const result = await buildUseCase().execute({
      userId,
      currency: "PEN",
      amountMinor: 5_000n,
      idempotencyKey: `credit:${randomUUID()}`,
    });

    expect(result.wallet.availableMinor).toBe(5_000n);
    expect(result.wallet.lockedMinor).toBe(0n);

    const faucetBalance = await uow.run((tx: DbTx) =>
      ledger.balanceOf(tx, "SIMULATION_FAUCET", "PEN"),
    );
    expect(faucetBalance).toBeLessThanOrEqual(0n);
  });

  it("replays the same idempotency key as a no-op", async () => {
    const userId = await createActiveUser();
    const idempotencyKey = `credit:${randomUUID()}`;
    const useCase = buildUseCase();

    const first = await useCase.execute({
      userId,
      currency: "PEN",
      amountMinor: 5_000n,
      idempotencyKey,
    });
    const second = await useCase.execute({
      userId,
      currency: "PEN",
      amountMinor: 5_000n,
      idempotencyKey,
    });

    expect(second.ledgerTransactionId).toBe(first.ledgerTransactionId);
    expect(second.wallet.availableMinor).toBe(5_000n);
  });

  it("rejects a credit that would exceed the daily cap (MET-RG-04)", async () => {
    const userId = await createActiveUser();
    const useCase = buildUseCase({ dailyCapMinor: 10_000n });

    await useCase.execute({
      userId,
      currency: "PEN",
      amountMinor: 8_000n,
      idempotencyKey: `credit:${randomUUID()}`,
    });

    await expect(
      useCase.execute({
        userId,
        currency: "PEN",
        amountMinor: 3_000n,
        idempotencyKey: `credit:${randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });

  it("sums against ledger-derived totals, not a cached counter", async () => {
    const userId = await createActiveUser();
    const useCase = buildUseCase({ dailyCapMinor: 10_000n });

    await useCase.execute({
      userId,
      currency: "PEN",
      amountMinor: 4_000n,
      idempotencyKey: `credit:${randomUUID()}`,
    });
    await useCase.execute({
      userId,
      currency: "PEN",
      amountMinor: 4_000n,
      idempotencyKey: `credit:${randomUUID()}`,
    });

    const result = await useCase.execute({
      userId,
      currency: "PEN",
      amountMinor: 2_000n,
      idempotencyKey: `credit:${randomUUID()}`,
    });
    expect(result.wallet.availableMinor).toBe(10_000n);

    await expect(
      useCase.execute({
        userId,
        currency: "PEN",
        amountMinor: 1n,
        idempotencyKey: `credit:${randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });

  it("is disabled outright when MONEY_MODE is not SIMULATED (RULE-K02)", async () => {
    const userId = await createActiveUser();
    const useCase = buildUseCase({ simulatedModeEnabled: false });

    await expect(
      useCase.execute({
        userId,
        currency: "PEN",
        amountMinor: 1_000n,
        idempotencyKey: `credit:${randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: "MONEY_MODE_FORBIDDEN" });
  });

  it("rejects a self-excluded account", async () => {
    const userId = await createActiveUser();
    await pool.query(`UPDATE users SET status = 'SELF_EXCLUDED' WHERE id = $1`, [userId]);

    await expect(
      buildUseCase().execute({
        userId,
        currency: "PEN",
        amountMinor: 1_000n,
        idempotencyKey: `credit:${randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_SELF_EXCLUDED" });
  });

  it("rejects a non-positive amount", async () => {
    const userId = await createActiveUser();

    await expect(
      buildUseCase().execute({
        userId,
        currency: "PEN",
        amountMinor: 0n,
        idempotencyKey: `credit:${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
