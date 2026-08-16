-- Purpose: bet_slips/bet_orders/match_allocations schema (T-208) — enforces RULE-B01
-- (matched <= requested) and RULE-B02 (requested = matched + unmatched + released) at the DB
-- level, a partial index for the order book (RULE-B?? / MATCHING_ENGINE.md book scan), and a
-- status-only-mutable trigger on match_allocations (RULE-B11: everything but status is
-- immutable after insert, since match_allocations pair two orders at a moment in time).
-- Affected tables: bet_slips, bet_orders, match_allocations.
-- Rollback: DROP TABLE match_allocations; DROP TABLE bet_orders; DROP TABLE bet_slips;
--   DROP TRIGGER trg_match_allocations_status_only ON match_allocations;
--   DROP FUNCTION fn_match_allocations_status_only;
--   DROP TYPE bet_order_status; DROP TYPE allocation_status;
-- Destructive: no (additive).

CREATE TYPE bet_order_status AS ENUM (
  'PENDING', 'OPEN', 'MATCHED', 'CANCELLED', 'SETTLED', 'VOIDED', 'REJECTED'
);

CREATE TYPE allocation_status AS ENUM ('ACTIVE', 'SETTLED', 'VOIDED');

CREATE TABLE bet_slips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bet_slips_user_id ON bet_slips (user_id);

CREATE TABLE bet_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_slip_id uuid NOT NULL REFERENCES bet_slips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  market_id uuid NOT NULL REFERENCES markets (id),
  outcome_id uuid NOT NULL REFERENCES outcomes (id),
  currency text NOT NULL,
  requested_minor bigint NOT NULL,
  matched_minor bigint NOT NULL DEFAULT 0,
  unmatched_minor bigint NOT NULL DEFAULT 0,
  released_minor bigint NOT NULL DEFAULT 0,
  odds_num integer NOT NULL,
  odds_den integer NOT NULL,
  commission_bps integer NOT NULL,
  status bet_order_status NOT NULL DEFAULT 'PENDING',
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_bo_matched_le_requested CHECK (matched_minor <= requested_minor),
  CONSTRAINT chk_bo_sum CHECK (requested_minor = matched_minor + unmatched_minor + released_minor)
);

CREATE UNIQUE INDEX uq_bet_orders_idempotency ON bet_orders (user_id, idempotency_key);
CREATE INDEX idx_bet_orders_bet_slip_id ON bet_orders (bet_slip_id);
CREATE INDEX idx_bet_orders_user_id ON bet_orders (user_id);
CREATE INDEX book_idx ON bet_orders (market_id, outcome_id, created_at, id)
  WHERE unmatched_minor > 0;

CREATE TABLE match_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets (id),
  order_a_id uuid NOT NULL REFERENCES bet_orders (id),
  order_b_id uuid NOT NULL REFERENCES bet_orders (id),
  sequence bigint NOT NULL,
  matched_minor bigint NOT NULL,
  status allocation_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_ma_distinct_orders CHECK (order_a_id <> order_b_id),
  CONSTRAINT chk_ma_matched_positive CHECK (matched_minor > 0),
  CONSTRAINT uq_ma_order_pair_sequence UNIQUE (order_a_id, order_b_id, sequence)
);

CREATE INDEX idx_match_allocations_market_id ON match_allocations (market_id);
CREATE INDEX idx_match_allocations_order_a_id ON match_allocations (order_a_id);
CREATE INDEX idx_match_allocations_order_b_id ON match_allocations (order_b_id);

CREATE FUNCTION fn_match_allocations_status_only() RETURNS trigger AS $$
BEGIN
  IF NEW.id <> OLD.id
    OR NEW.market_id <> OLD.market_id
    OR NEW.order_a_id <> OLD.order_a_id
    OR NEW.order_b_id <> OLD.order_b_id
    OR NEW.sequence <> OLD.sequence
    OR NEW.matched_minor <> OLD.matched_minor
    OR NEW.created_at <> OLD.created_at
  THEN
    RAISE EXCEPTION 'match_allocations rows are immutable except status (RULE-B11)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_match_allocations_status_only
  BEFORE UPDATE ON match_allocations
  FOR EACH ROW EXECUTE FUNCTION fn_match_allocations_status_only();
