import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork } from "@/infra/db/uow";
import { LedgerService } from "@/infra/db/ledger";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { SystemClock } from "@/infra/clock";
import type { LedgerPostInput } from "@/domain/ports";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("LedgerService.post()", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ledger = new LedgerService(new CryptoIdGenerator(), new SystemClock());

  let userId: string;

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // ledger_entries/ledger_transactions are append-only (RULE-F04) — reset the whole
    // schema rather than DELETE, so every test starts from a clean ledger.
    await resetAndMigrate(pool);

    const result = await pool.query(
      `INSERT INTO users (email, date_of_birth) VALUES ($1, $2) RETURNING id`,
      [`ledger-owner-${randomUUID()}@example.test`, "1990-01-01"],
    );
    userId = result.rows[0].id;
    await pool.query(
      `INSERT INTO wallets (user_id, currency, available_minor, locked_minor) VALUES ($1, $2, $3, $4)`,
      [userId, "PEN", 0, 0],
    );
  });

  function faucetInput(overrides: Partial<LedgerPostInput> = {}): LedgerPostInput {
    return {
      id: randomUUID(),
      kind: "FAUCET",
      referenceType: "payment",
      referenceId: randomUUID(),
      idempotencyKey: randomUUID(),
      actorType: "SYSTEM",
      actorId: undefined,
      entries: [
        { accountKey: "SIMULATION_FAUCET", currency: "PEN", signedAmountMinor: -10_000n },
        { accountKey: `USER_AVAILABLE:${userId}`, currency: "PEN", signedAmountMinor: 10_000n },
      ],
      ...overrides,
    };
  }

  it("posts a FAUCET transaction and updates the wallet projection", async () => {
    const txn = await uow.run((tx) => ledger.post(tx, faucetInput()));

    expect(txn.entries).toHaveLength(2);

    const [wallet] = (
      await pool.query(`SELECT available_minor, version FROM wallets WHERE user_id = $1`, [userId])
    ).rows;
    expect(BigInt(wallet.available_minor)).toBe(10_000n);
    expect(BigInt(wallet.version)).toBe(1n);
  });

  it("rejects an unbalanced transaction before writing anything", async () => {
    const input = faucetInput({
      entries: [
        { accountKey: "SIMULATION_FAUCET", currency: "PEN", signedAmountMinor: -10_000n },
        { accountKey: `USER_AVAILABLE:${userId}`, currency: "PEN", signedAmountMinor: 9_000n },
      ],
    });

    await expect(uow.run((tx) => ledger.post(tx, input))).rejects.toThrow();

    const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM ledger_transactions`);
    expect(rows[0].count).toBe(0);
  });

  it("replays a duplicate idempotency key as a no-op returning the existing transaction", async () => {
    const input = faucetInput();

    const first = await uow.run((tx) => ledger.post(tx, input));
    const second = await uow.run((tx) => ledger.post(tx, input));

    expect(second.id).toBe(first.id);

    const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM ledger_transactions`);
    expect(rows[0].count).toBe(1);

    const [wallet] = (
      await pool.query(`SELECT available_minor FROM wallets WHERE user_id = $1`, [userId])
    ).rows;
    expect(BigInt(wallet.available_minor)).toBe(10_000n);
  });

  it("locks wallets in ascending user_id order across multiple touched users", async () => {
    const other = await pool.query(
      `INSERT INTO users (email, date_of_birth) VALUES ($1, $2) RETURNING id`,
      [`ledger-owner-2-${randomUUID()}@example.test`, "1990-01-01"],
    );
    const otherId: string = other.rows[0].id;
    await pool.query(
      `INSERT INTO wallets (user_id, currency, available_minor, locked_minor) VALUES ($1, $2, $3, $4)`,
      [otherId, "PEN", 0, 5_000],
    );
    await pool.query(`UPDATE wallets SET locked_minor = 5000 WHERE user_id = $1`, [userId]);

    const [lowId, highId] = [userId, otherId].sort();

    const input = faucetInput({
      entries: [
        { accountKey: `USER_LOCKED:${highId}`, currency: "PEN", signedAmountMinor: -1_000n },
        { accountKey: `USER_AVAILABLE:${lowId}`, currency: "PEN", signedAmountMinor: 1_000n },
      ],
    });

    await uow.run((tx) => ledger.post(tx, input));

    const { rows } = await pool.query(
      `SELECT user_id, available_minor, locked_minor FROM wallets WHERE user_id IN ($1, $2)`,
      [lowId, highId],
    );
    expect(rows).toHaveLength(2);
  });
});
