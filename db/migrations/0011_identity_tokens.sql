-- Purpose: registration/email-verification support (T-302, T-303) — defaults new
-- users to the PENDING_VERIFICATION state added by 0010, adds single-use hashed
-- verification/reset token tables, and the app_role grants that 0001_identity.sql's
-- tables (users, user_roles, sessions, login_attempts) never received.
-- Affected: users.status default; new tables email_verification_tokens,
--   password_reset_tokens.
-- Rollback: DROP TABLE password_reset_tokens, email_verification_tokens;
--   ALTER TABLE users ALTER COLUMN status SET DEFAULT 'ACTIVE';
-- Destructive: no (additive).

ALTER TABLE users ALTER COLUMN status SET DEFAULT 'PENDING_VERIFICATION';

CREATE TABLE email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX idx_email_verification_tokens_user ON email_verification_tokens (user_id);

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens (user_id);

GRANT SELECT, INSERT, UPDATE ON users, sessions TO app_role;
REVOKE DELETE, TRUNCATE ON users, sessions FROM app_role;

GRANT SELECT, INSERT, DELETE ON user_roles TO app_role;
REVOKE UPDATE, TRUNCATE ON user_roles FROM app_role;

GRANT SELECT, INSERT ON login_attempts TO app_role;
REVOKE UPDATE, DELETE, TRUNCATE ON login_attempts FROM app_role;

GRANT SELECT, INSERT, UPDATE ON email_verification_tokens, password_reset_tokens TO app_role;
REVOKE DELETE, TRUNCATE ON email_verification_tokens, password_reset_tokens FROM app_role;
