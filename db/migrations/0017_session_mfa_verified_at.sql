-- Purpose: T-412 — step-up auth for admin catalog routes. Admin mutations require a
-- session that has re-proven MFA recently (RULE-T06/RULE-E13); this column records when
-- that last happened so requireStepUp() can check it's within the freshness window.
-- Affected tables: sessions (new nullable column, no backfill).
-- Rollback: ALTER TABLE sessions DROP COLUMN mfa_verified_at;
-- Destructive: no (additive, nullable column; UPDATE already granted to app_role on sessions).

ALTER TABLE sessions ADD COLUMN mfa_verified_at timestamptz NULL;
