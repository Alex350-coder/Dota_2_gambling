-- Purpose: TOTP MFA support (T-308) — tracks when MFA was activated (as opposed
-- to merely enrolled-but-unverified, which only sets users.mfa_secret_enc) and
-- adds single-use hashed recovery codes for accounts that lose their
-- authenticator device.
-- Affected: new column users.mfa_enabled_at; new table mfa_recovery_codes.
-- Rollback: ALTER TABLE users DROP COLUMN mfa_enabled_at;
--   DROP TABLE mfa_recovery_codes;
-- Destructive: no (additive).

ALTER TABLE users ADD COLUMN mfa_enabled_at timestamptz;

CREATE TABLE mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  code_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);
CREATE INDEX idx_mfa_recovery_codes_user ON mfa_recovery_codes (user_id);

GRANT SELECT, INSERT, UPDATE ON mfa_recovery_codes TO app_role;
REVOKE DELETE, TRUNCATE ON mfa_recovery_codes FROM app_role;
