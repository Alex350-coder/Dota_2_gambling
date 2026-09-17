-- Purpose: responsible-gambling schema (T-808) — rg_limits (per-user, per-kind limit with a
-- pending-raise/cooling-off pair per RULE-K07) and self_exclusions (append-only history of
-- self-exclusion periods), plus users.revocable_at so assertActiveAccount's existing
-- SELF_EXCLUDED guard (src/domain/identity/status.ts) has a column to read for "irrevocable
-- before revocable_at" (RESPONSIBLE_GAMBLING.md §3). The SELF_EXCLUDED user_status enum value
-- already exists (0001_identity.sql), so no enum migration is needed here.
-- Affected tables: rg_limits, self_exclusions; users gains revocable_at.
-- Rollback: ALTER TABLE users DROP COLUMN revocable_at; DROP TABLE self_exclusions, rg_limits;
--   DROP TYPE rg_limit_kind, rg_limit_period; also revoke the app_role grants this migration adds.
-- Destructive: no (additive).

CREATE TYPE rg_limit_kind AS ENUM ('DEPOSIT', 'STAKE', 'LOSS', 'SESSION_TIME', 'SINGLE_BET');
CREATE TYPE rg_limit_period AS ENUM ('DAY', 'WEEK', 'MONTH', 'SESSION', 'PER_BET');

CREATE TABLE rg_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  kind rg_limit_kind NOT NULL,
  period rg_limit_period NOT NULL,
  current_value bigint NOT NULL,
  pending_value bigint,
  effective_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rg_limits_current_non_negative CHECK (current_value >= 0),
  CONSTRAINT chk_rg_limits_pending_non_negative CHECK (pending_value IS NULL OR pending_value >= 0),
  CONSTRAINT chk_rg_limits_pending_pair CHECK (
    (pending_value IS NULL AND effective_at IS NULL) OR
    (pending_value IS NOT NULL AND effective_at IS NOT NULL)
  ),
  CONSTRAINT uq_rg_limits_user_kind_period UNIQUE (user_id, kind, period)
);

CREATE INDEX idx_rg_limits_user ON rg_limits (user_id);

CREATE TABLE self_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  period text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  revocable_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_self_exclusions_user ON self_exclusions (user_id);

CREATE TRIGGER trg_self_exclusions_immutable
  BEFORE UPDATE OR DELETE ON self_exclusions
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();

ALTER TABLE users ADD COLUMN revocable_at timestamptz;

GRANT SELECT, INSERT, UPDATE, DELETE ON rg_limits TO app_role;

GRANT SELECT, INSERT ON self_exclusions TO app_role;
REVOKE UPDATE, DELETE, TRUNCATE ON self_exclusions FROM app_role;
