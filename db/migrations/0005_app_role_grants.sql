-- Purpose: least-privilege application role (T-206) — the app connects as app_role, which has
-- no UPDATE/DELETE on the append-only ledger tables (RULE-F04, MET-FIN-10), enforcing at the
-- grant layer what T-205's triggers already enforce at the trigger layer (defense in depth).
-- app_role is created NOLOGIN with no password here; a deploy/test bootstrap step sets its
-- password out-of-band via ALTER ROLE, so no secret is ever committed to this file.
-- Affected: new role app_role; table grants on ledger_transactions, ledger_entries, wallets.
-- Rollback: REVOKE ALL ON ledger_transactions, ledger_entries, wallets FROM app_role;
--   REVOKE USAGE ON SCHEMA public FROM app_role; DROP ROLE app_role;
-- Destructive: no (additive).

-- Roles are cluster-level, not schema-level, so a test harness that drops/recreates the
-- `public` schema between runs must not fail on a role that already exists from a prior run.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role') THEN
    CREATE ROLE app_role NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_role;

GRANT SELECT, INSERT ON ledger_transactions, ledger_entries TO app_role;
REVOKE UPDATE, DELETE, TRUNCATE ON ledger_transactions, ledger_entries FROM app_role;

GRANT SELECT, INSERT, UPDATE ON wallets TO app_role;
REVOKE DELETE, TRUNCATE ON wallets FROM app_role;
