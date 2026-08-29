-- Purpose: RULE-B08 — FIFO book scans and "newest first" bet listing tie-break on
-- (created_at, id) today. created_at is app-injected-clock, millisecond resolution, and id
-- is a random UUID, so two orders placed within the same millisecond can sort in a
-- non-deterministic order that doesn't reflect actual submission order (found via
-- tests/integration/application/betting/match.test.ts's FIN-03 failing intermittently in CI).
-- A DB-generated monotonic sequence fixes this: inserts are serialized by Postgres itself,
-- so `seq` always reflects true insertion order regardless of clock resolution.
-- Affected tables: bet_orders (new bigserial column + sequence, book_idx recreated to use it).
-- Rollback: DROP INDEX book_idx; CREATE INDEX book_idx ON bet_orders (market_id, outcome_id, created_at, id) WHERE unmatched_minor > 0; ALTER TABLE bet_orders DROP COLUMN seq;
-- Destructive: no (additive column; index recreation is index-only, no data loss).

ALTER TABLE bet_orders ADD COLUMN seq bigserial NOT NULL;

DROP INDEX book_idx;
CREATE INDEX book_idx ON bet_orders (market_id, outcome_id, created_at, seq)
  WHERE unmatched_minor > 0;
