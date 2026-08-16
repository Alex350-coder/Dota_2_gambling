-- Purpose: market_results/settlement_runs schema (T-209) — result ingestion and settlement-run
-- bookkeeping, per Claude/domain/RESULT_PROVIDERS.md §3 and Claude/domain/SETTLEMENT.md §3.
-- result_status mirrors src/domain/settlement/state.ts's MarketResultStatus exactly, including
-- VOID_PROPOSED (added to the domain type in this same task so the DB enum and domain type never
-- drift). Both partial unique indexes are the DB-level guarantee that a market can have at most
-- one CONFIRMED result (RULE-E-adjacent) and at most one COMPLETED settlement run (RULE-F12).
-- Affected tables: market_results, settlement_runs.
-- Rollback: DROP TABLE settlement_runs, market_results;
--   DROP TYPE settlement_run_status; DROP TYPE result_trust_level; DROP TYPE result_status;
-- Destructive: no (additive).

CREATE TYPE result_status AS ENUM (
  'PENDING', 'PROPOSED', 'CONFIRMED', 'DISPUTED', 'SUPERSEDED', 'VOID_PROPOSED'
);

CREATE TYPE result_trust_level AS ENUM (
  'UNVERIFIED', 'SINGLE_SOURCE', 'CORROBORATED', 'OFFICIAL'
);

CREATE TABLE market_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets (id),
  provider_key text NOT NULL,
  trust_level result_trust_level NOT NULL,
  winning_outcome_id uuid REFERENCES outcomes (id),
  raw_payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  status result_status NOT NULL DEFAULT 'PENDING',
  proposed_by uuid REFERENCES users (id),
  confirmed_by uuid REFERENCES users (id),
  supersedes_id uuid REFERENCES market_results (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE INDEX idx_market_results_market_id ON market_results (market_id);
CREATE UNIQUE INDEX one_confirmed_result_per_market
  ON market_results (market_id) WHERE status = 'CONFIRMED';

CREATE TYPE settlement_run_status AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');

CREATE TABLE settlement_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets (id),
  result_id uuid NOT NULL REFERENCES market_results (id),
  status settlement_run_status NOT NULL DEFAULT 'IN_PROGRESS',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  allocations_total integer NOT NULL DEFAULT 0,
  allocations_settled integer NOT NULL DEFAULT 0,
  payout_total_minor bigint NOT NULL DEFAULT 0,
  commission_total_minor bigint NOT NULL DEFAULT 0,
  refund_total_minor bigint NOT NULL DEFAULT 0
);

CREATE INDEX idx_settlement_runs_market_id ON settlement_runs (market_id);
CREATE UNIQUE INDEX one_completed_run_per_market
  ON settlement_runs (market_id) WHERE status = 'COMPLETED';
