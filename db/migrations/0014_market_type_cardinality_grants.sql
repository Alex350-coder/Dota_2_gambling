-- Purpose: T-404/T-405 — add market_types.outcome_cardinality so the domain-layer binary-model
-- guard (assertSupportedByEconomicModel) has a persisted field to read back, and grant app_role
-- the access it was missing on market_types/economic_profiles (0006_catalog.sql created both
-- tables but never granted app_role on them). economic_profiles is insert-only, matching the
-- append-only ledger pattern (RULE-F04) — a profile is never mutated once a market can reference it.
-- Affected [tables]: market_types (new column), app_role grants on market_types, economic_profiles.
-- Rollback: REVOKE ALL ON market_types, economic_profiles FROM app_role;
--   ALTER TABLE market_types DROP COLUMN outcome_cardinality; DROP TYPE outcome_cardinality;
-- Destructive: no (additive column with a default; existing seeded rows remain valid).

CREATE TYPE outcome_cardinality AS ENUM ('BINARY', 'N_ARY');

ALTER TABLE market_types
  ADD COLUMN outcome_cardinality outcome_cardinality NOT NULL DEFAULT 'BINARY';

GRANT SELECT, INSERT ON market_types TO app_role;
REVOKE UPDATE, DELETE, TRUNCATE ON market_types FROM app_role;

GRANT SELECT, INSERT ON economic_profiles TO app_role;
REVOKE UPDATE, DELETE, TRUNCATE ON economic_profiles FROM app_role;
