-- Purpose: risk_alerts schema (T-913) — the deterministic-fraud-rule sink defined by
-- compliance/FRAUD_PREVENTION.md §3/§4. Rules R-03..R-12 (Phase 9) each write exactly one row
-- here, evaluated post-commit and asynchronously so they never block or slow a legitimate bet
-- (R-01/R-02 remain the only inline blocks, implemented in P5's betting guards, out of scope
-- here). The review workflow (OPEN -> UNDER_REVIEW -> {CONFIRMED_ABUSE|FALSE_POSITIVE|
-- INCONCLUSIVE} -> CLOSED, §4) needs mutable status/review columns, so unlike ledger/audit_events
-- this table is not append-only and carries no immutability trigger.
-- Affected tables: risk_alerts (new).
-- Rollback: DROP TABLE risk_alerts; DROP TYPE risk_alert_severity, risk_alert_status.
-- Destructive: no (additive).

CREATE TYPE risk_alert_severity AS ENUM ('MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE risk_alert_status AS ENUM (
  'OPEN',
  'UNDER_REVIEW',
  'CONFIRMED_ABUSE',
  'FALSE_POSITIVE',
  'INCONCLUSIVE',
  'CLOSED'
);

CREATE TABLE risk_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id text NOT NULL,
  severity risk_alert_severity NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL,
  status risk_alert_status NOT NULL DEFAULT 'OPEN',
  reviewed_by uuid REFERENCES users (id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_risk_alerts_review_pair CHECK (
    (reviewed_by IS NULL AND reviewed_at IS NULL) OR
    (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX idx_risk_alerts_rule ON risk_alerts (rule_id, created_at);
CREATE INDEX idx_risk_alerts_status ON risk_alerts (status);
CREATE INDEX idx_risk_alerts_entity ON risk_alerts (entity_type, entity_id);

GRANT SELECT, INSERT, UPDATE ON risk_alerts TO app_role;
REVOKE DELETE, TRUNCATE ON risk_alerts FROM app_role;
