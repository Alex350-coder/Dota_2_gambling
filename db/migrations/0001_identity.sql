-- Purpose: identity stubs (T-202) — users, roles, sessions, login attempts — needed as
-- FK targets for wallets/ledger/betting tables in later migrations.
-- Affected tables: users, user_roles, sessions, login_attempts.
-- Rollback: DROP TABLE login_attempts, sessions, user_roles, users; (reverse FK order).
-- Destructive: no (additive).

CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED', 'SELF_EXCLUDED');
CREATE TYPE user_role AS ENUM ('USER', 'ADMIN', 'STREAMER', 'AUDITOR');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  email_verified_at timestamptz,
  password_hash text,
  status user_status NOT NULL DEFAULT 'ACTIVE',
  date_of_birth date NOT NULL,
  mfa_secret_enc text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_users_age CHECK (date_of_birth <= current_date - interval '18 years')
);

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users (id),
  role user_role NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE INDEX idx_user_roles_user_id ON user_roles (user_id);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  token_hash text NOT NULL UNIQUE,
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX idx_sessions_user_expiry ON sessions (user_id, expires_at);

CREATE TABLE login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash text NOT NULL,
  ip_hash text,
  succeeded boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_attempts_email_created ON login_attempts (email_hash, created_at);
