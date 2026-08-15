-- Purpose: wallet balance projection (T-203) — one row per user/currency, updated only by
-- LedgerService (T-212) as the sole writer; available/locked must never go negative.
-- Affected tables: wallets.
-- Rollback: DROP TABLE wallets;
-- Destructive: no (additive).

CREATE TABLE wallets (
  user_id uuid NOT NULL REFERENCES users (id),
  currency text NOT NULL,
  available_minor bigint NOT NULL DEFAULT 0,
  locked_minor bigint NOT NULL DEFAULT 0,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, currency),
  CONSTRAINT chk_wallets_available_nonneg CHECK (available_minor >= 0),
  CONSTRAINT chk_wallets_locked_nonneg CHECK (locked_minor >= 0)
);
