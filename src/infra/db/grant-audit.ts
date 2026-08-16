import type { Pool } from "pg";

const LEDGER_TABLES = ["ledger_transactions", "ledger_entries"];
const FORBIDDEN_PRIVILEGES = ["UPDATE", "DELETE", "TRUNCATE"];

export interface ForbiddenGrant {
  readonly tableName: string;
  readonly privilegeType: string;
}

/**
 * MET-FIN-10: app_role must never hold UPDATE/DELETE/TRUNCATE on the append-only ledger tables.
 * Queries information_schema directly rather than trusting the migration file, so drift between
 * what 0005_app_role_grants.sql says and what's actually applied to a given database is caught.
 */
export async function findForbiddenLedgerGrants(pool: Pool): Promise<ForbiddenGrant[]> {
  const result = await pool.query<{ table_name: string; privilege_type: string }>(
    `SELECT table_name, privilege_type
     FROM information_schema.role_table_grants
     WHERE grantee = 'app_role'
       AND table_name = ANY($1)
       AND privilege_type = ANY($2)`,
    [LEDGER_TABLES, FORBIDDEN_PRIVILEGES],
  );

  return result.rows.map((row) => ({
    tableName: row.table_name,
    privilegeType: row.privilege_type,
  }));
}
