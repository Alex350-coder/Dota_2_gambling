import { createDb, createPool } from "@/infra/db/client";
import { findForbiddenLedgerGrants } from "@/infra/db/grant-audit";
import { loadConfig } from "@/platform/config";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config);
  createDb(pool);

  try {
    const forbidden = await findForbiddenLedgerGrants(pool);

    if (forbidden.length > 0) {
      for (const grant of forbidden) {
        console.error(`FORBIDDEN GRANT: app_role has ${grant.privilegeType} on ${grant.tableName}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log(
      "audit-grants: app_role has no UPDATE/DELETE/TRUNCATE on ledger tables (MET-FIN-10 = 0)",
    );
  } finally {
    await pool.end();
  }
}

void main();
