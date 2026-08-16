import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";

describe("0003_ledger migration", () => {
  const pool = createPool(testDbConfig());

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("accepts a transaction with balanced nonzero entries", async () => {
    const tx = await pool.query(
      `INSERT INTO ledger_transactions (kind, reference_type, reference_id, idempotency_key, actor_type)
       VALUES ('FAUCET', 'payment', gen_random_uuid(), 'idem-1', 'SYSTEM') RETURNING id`,
    );
    const transactionId = tx.rows[0].id;

    await pool.query(
      `INSERT INTO ledger_entries (transaction_id, account_key, currency, signed_amount_minor)
       VALUES ($1, 'user:1', 'PEN', 1000), ($1, 'platform:faucet', 'PEN', -1000)`,
      [transactionId],
    );

    const entries = await pool.query(`SELECT id FROM ledger_entries WHERE transaction_id = $1`, [
      transactionId,
    ]);
    expect(entries.rows).toHaveLength(2);
  });

  it("rejects a duplicate idempotency_key", async () => {
    await pool.query(
      `INSERT INTO ledger_transactions (kind, reference_type, reference_id, idempotency_key, actor_type)
       VALUES ('FAUCET', 'payment', gen_random_uuid(), 'idem-dup', 'SYSTEM')`,
    );

    await expect(
      pool.query(
        `INSERT INTO ledger_transactions (kind, reference_type, reference_id, idempotency_key, actor_type)
         VALUES ('FAUCET', 'payment', gen_random_uuid(), 'idem-dup', 'SYSTEM')`,
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it("rejects a zero-amount entry (chk_ledger_entries_nonzero)", async () => {
    const tx = await pool.query(
      `INSERT INTO ledger_transactions (kind, reference_type, reference_id, idempotency_key, actor_type)
       VALUES ('FAUCET', 'payment', gen_random_uuid(), 'idem-zero', 'SYSTEM') RETURNING id`,
    );

    await expect(
      pool.query(
        `INSERT INTO ledger_entries (transaction_id, account_key, currency, signed_amount_minor)
         VALUES ($1, 'user:1', 'PEN', 0)`,
        [tx.rows[0].id],
      ),
    ).rejects.toThrow(/chk_ledger_entries_nonzero/);
  });
});
