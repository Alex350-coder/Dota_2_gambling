-- Purpose: platform tables (T-210) — audit_events (append-only, same trigger pattern as the
-- ledger), idempotency_keys, jobs, outbox, and the money_mode singleton that boots RULE-K01
-- (MONEY_MODE must default to SIMULATED; the row is written once here and never mutated).
-- Affected tables: audit_events, idempotency_keys, jobs, outbox, money_mode.
-- Rollback: DROP TABLE money_mode, outbox, jobs, idempotency_keys, audit_events;
--   DROP TRIGGER trg_audit_events_immutable ON audit_events; DROP TYPE money_mode_value;
--   also revoke the app_role grants this migration adds.
-- Destructive: no (additive).

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  ip_hash text,
  user_agent text,
  before jsonb,
  after jsonb,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_events_entity ON audit_events (entity_type, entity_id);
CREATE INDEX idx_audit_events_actor ON audit_events (actor_type, actor_id);

CREATE TRIGGER trg_audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();

CREATE TABLE idempotency_keys (
  user_id uuid NOT NULL REFERENCES users (id),
  route text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, route, key)
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_run_at ON jobs (run_at) WHERE status = 'PENDING';

CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz
);

CREATE INDEX idx_outbox_undispatched ON outbox (created_at) WHERE dispatched_at IS NULL;

CREATE TYPE money_mode_value AS ENUM ('SIMULATED', 'REAL');

CREATE TABLE money_mode (
  singleton_id boolean PRIMARY KEY DEFAULT true,
  mode money_mode_value NOT NULL,
  initialised_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_money_mode_singleton CHECK (singleton_id)
);

INSERT INTO money_mode (mode) VALUES ('SIMULATED');

GRANT SELECT, INSERT ON audit_events TO app_role;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM app_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys, jobs, outbox TO app_role;

GRANT SELECT ON money_mode TO app_role;
