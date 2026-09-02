-- Purpose: T-612 — the retry sweeper needs durable state to compute exponential backoff and
-- decide when to alert across separate sweep invocations (a single in-memory counter would
-- reset every time the sweeper process restarts, defeating "alert after 3 failures").
-- Affected tables: settlement_runs (two additive, nullable-safe columns).
-- Rollback: ALTER TABLE settlement_runs DROP COLUMN retry_count; ALTER TABLE settlement_runs DROP COLUMN next_retry_at;
-- Destructive: no (additive columns only, both default-backed).

ALTER TABLE settlement_runs ADD COLUMN retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE settlement_runs ADD COLUMN next_retry_at timestamptz;
