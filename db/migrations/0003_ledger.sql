-- Purpose: append-only double-entry ledger (T-204) — mirrors src/domain/ledger/entries.ts
-- exactly (kind/reference/actor fields, signed_amount_minor). Immutability, balance and
-- single-currency enforcement land as triggers in 0004 (T-205); this migration is schema only.
-- Affected tables: ledger_transactions, ledger_entries.
-- Rollback: DROP TABLE ledger_entries, ledger_transactions; DROP TYPE ledger_transaction_kind,
--   ledger_actor_type, ledger_reference_type;
-- Destructive: no (additive).

CREATE TYPE ledger_transaction_kind AS ENUM (
  'DEPOSIT', 'RESERVE', 'MATCH_ESCROW', 'RELEASE', 'SETTLE_PAYOUT', 'SETTLE_COMMISSION',
  'VOID_REFUND', 'WITHDRAWAL', 'ADJUSTMENT', 'FAUCET'
);
CREATE TYPE ledger_actor_type AS ENUM ('USER', 'ADMIN', 'SYSTEM');
CREATE TYPE ledger_reference_type AS ENUM ('bet_order', 'match_allocation', 'market', 'payment');

CREATE TABLE ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind ledger_transaction_kind NOT NULL,
  reference_type ledger_reference_type NOT NULL,
  reference_id uuid NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  actor_type ledger_actor_type NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_transactions_reference ON ledger_transactions (reference_type, reference_id);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES ledger_transactions (id),
  account_key text NOT NULL,
  currency text NOT NULL,
  signed_amount_minor bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_ledger_entries_nonzero CHECK (signed_amount_minor <> 0)
);
CREATE INDEX idx_ledger_entries_account_created ON ledger_entries (account_key, created_at);
CREATE INDEX idx_ledger_entries_transaction_id ON ledger_entries (transaction_id);
