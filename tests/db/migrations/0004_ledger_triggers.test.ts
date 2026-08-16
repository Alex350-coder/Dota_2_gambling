import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { createPool } from "@/infra/db/client";
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";

describe("0004_ledger_triggers migration", () => {
  const pool = createPool(testDbConfig());
  let client: PoolClient;

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  afterEach(async () => {
    if (client) {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  async function insertBalancedTransaction(idempotencyKey: string): Promise<string> {
    const tx = await pool.query(
      `INSERT INTO ledger_transactions (kind, reference_type, reference_id, idempotency_key, actor_type)
       VALUES ('FAUCET', 'payment', gen_random_uuid(), $1, 'SYSTEM') RETURNING id`,
      [idempotencyKey],
    );
    const transactionId = tx.rows[0].id;
    await pool.query(
      `INSERT INTO ledger_entries (transaction_id, account_key, currency, signed_amount_minor)
       VALUES ($1, 'user:1', 'PEN', 1000), ($1, 'platform:faucet', 'PEN', -1000)`,
      [transactionId],
    );
    return transactionId;
  }

  it("rejects UPDATE on ledger_transactions (append-only)", async () => {
    const transactionId = await insertBalancedTransaction("trg-idem-1");
    await expect(
      pool.query(`UPDATE ledger_transactions SET kind = 'ADJUSTMENT' WHERE id = $1`, [
        transactionId,
      ]),
    ).rejects.toThrow(/append-only/);
  });

  it("rejects DELETE on ledger_entries (append-only)", async () => {
    const transactionId = await insertBalancedTransaction("trg-idem-2");
    await expect(
      pool.query(`DELETE FROM ledger_entries WHERE transaction_id = $1`, [transactionId]),
    ).rejects.toThrow(/append-only/);
  });

  it("rejects an unbalanced transaction at COMMIT (deferred constraint trigger)", async () => {
    client = await pool.connect();
    await client.query("BEGIN");

    const tx = await client.query(
      `INSERT INTO ledger_transactions (kind, reference_type, reference_id, idempotency_key, actor_type)
       VALUES ('FAUCET', 'payment', gen_random_uuid(), 'trg-idem-3', 'SYSTEM') RETURNING id`,
    );
    const transactionId = tx.rows[0].id;

    // Single unbalanced entry: this insert itself must succeed (trigger is deferred).
    await client.query(
      `INSERT INTO ledger_entries (transaction_id, account_key, currency, signed_amount_minor)
       VALUES ($1, 'user:1', 'PEN', 1000)`,
      [transactionId],
    );

    await expect(client.query("COMMIT")).rejects.toThrow(/does not sum to zero/);
  });

  it("rejects a mixed-currency transaction at COMMIT (deferred constraint trigger)", async () => {
    client = await pool.connect();
    await client.query("BEGIN");

    const tx = await client.query(
      `INSERT INTO ledger_transactions (kind, reference_type, reference_id, idempotency_key, actor_type)
       VALUES ('FAUCET', 'payment', gen_random_uuid(), 'trg-idem-4', 'SYSTEM') RETURNING id`,
    );
    const transactionId = tx.rows[0].id;

    await client.query(
      `INSERT INTO ledger_entries (transaction_id, account_key, currency, signed_amount_minor)
       VALUES ($1, 'user:1', 'PEN', 1000), ($1, 'platform:faucet', 'USD', -1000)`,
      [transactionId],
    );

    await expect(client.query("COMMIT")).rejects.toThrow(/more than one currency/);
  });
});
