import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { LedgerService } from "@/infra/db/ledger";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { SystemClock } from "@/infra/clock";
import { ListTransactionsUseCase } from "@/application/wallet/list-transactions";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("ListTransactionsUseCase (T-805)", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const clock = new SystemClock();
  const ledger = new LedgerService(ids, clock);

  const listTransactions = new ListTransactionsUseCase<DbTx>({ uow, ledger });

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
      [userId, `list-tx-${randomUUID()}@example.test`],
    );
    await pool.query(
      "INSERT INTO wallets (user_id, currency, available_minor, locked_minor) VALUES ($1, 'PEN', 0, 0)",
      [userId],
    );
    return userId;
  }

  async function postFaucet(userId: string, amountMinor: bigint): Promise<void> {
    await uow.run((tx) =>
      ledger.post(tx, {
        id: ids.next(),
        kind: "FAUCET",
        referenceType: "payment",
        referenceId: userId,
        idempotencyKey: randomUUID(),
        actorType: "SYSTEM",
        actorId: undefined,
        entries: [
          { accountKey: "SIMULATION_FAUCET", currency: "PEN", signedAmountMinor: -amountMinor },
          {
            accountKey: `USER_AVAILABLE:${userId}`,
            currency: "PEN",
            signedAmountMinor: amountMinor,
          },
        ],
      }),
    );
  }

  it("returns an empty page for a user with no ledger activity", async () => {
    const userId = await createUser();
    const page = await listTransactions.execute({ userId, currency: "PEN" });
    expect(page.items).toHaveLength(0);
    expect(page.total).toBe(0);
  });

  it("returns only the caller's own entries, defaulting to page 1 / limit 20", async () => {
    const userId = await createUser();
    const other = await createUser();
    await postFaucet(userId, 1_000n);
    await postFaucet(userId, 2_000n);
    await postFaucet(other, 5_000n);

    const page = await listTransactions.execute({ userId, currency: "PEN" });
    expect(page.total).toBe(2);
    expect(page.page).toBe(1);
    expect(page.limit).toBe(20);
    expect(page.items.map((e) => e.signedAmountMinor).sort()).toEqual([1_000n, 2_000n]);
    expect(page.items.every((e) => e.kind === "FAUCET")).toBe(true);
  });

  it("clamps limit to the hard maximum (RULE-G04)", async () => {
    const userId = await createUser();
    await postFaucet(userId, 100n);

    const page = await listTransactions.execute({ userId, currency: "PEN", limit: 999 });
    expect(page.limit).toBe(50);
  });
});
