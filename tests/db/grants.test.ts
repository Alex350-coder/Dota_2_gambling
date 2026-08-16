import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createPool } from "@/infra/db/client";
import { findForbiddenLedgerGrants } from "@/infra/db/grant-audit";
import { testDbConfig } from "../helpers/test-db-config";
import { resetAndMigrate } from "../helpers/reset-db";
import { grantAppRoleLogin } from "../helpers/app-role";

describe("app_role grants", () => {
  const adminPool = createPool(testDbConfig());
  const config = testDbConfig();
  const appRolePassword = "test-app-role-password-only";
  let appRolePool: Pool;
  let transactionId: string;

  beforeAll(async () => {
    await resetAndMigrate(adminPool);
    await grantAppRoleLogin(adminPool, appRolePassword);

    const url = new URL(config.DATABASE_URL);
    url.username = "app_role";
    url.password = appRolePassword;
    appRolePool = new Pool({ connectionString: url.toString() });

    const tx = await adminPool.query(
      `INSERT INTO ledger_transactions (kind, reference_type, reference_id, idempotency_key, actor_type)
       VALUES ('FAUCET', 'payment', gen_random_uuid(), 'grants-idem-1', 'SYSTEM') RETURNING id`,
    );
    transactionId = tx.rows[0].id;
    await adminPool.query(
      `INSERT INTO ledger_entries (transaction_id, account_key, currency, signed_amount_minor)
       VALUES ($1, 'user:1', 'PEN', 1000), ($1, 'platform:faucet', 'PEN', -1000)`,
      [transactionId],
    );
  });

  afterAll(async () => {
    await appRolePool.end();
    await adminPool.end();
  });

  it("rejects UPDATE on ledger_transactions as app_role (permission denied)", async () => {
    await expect(
      appRolePool.query(`UPDATE ledger_transactions SET kind = 'ADJUSTMENT' WHERE id = $1`, [
        transactionId,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it("rejects DELETE on ledger_entries as app_role (permission denied)", async () => {
    await expect(
      appRolePool.query(`DELETE FROM ledger_entries WHERE transaction_id = $1`, [transactionId]),
    ).rejects.toThrow(/permission denied/);
  });

  it("findForbiddenLedgerGrants reports none for a correctly-migrated database", async () => {
    const forbidden = await findForbiddenLedgerGrants(adminPool);
    expect(forbidden).toHaveLength(0);
  });
});
