-- Purpose: enforce ledger append-only (RULE-F04), balanced-transaction (RULE-F05/INV-02) and
-- single-currency-per-transaction (RULE-F16) invariants at the database level, so they hold even
-- if application code has a bug (defense in depth alongside T-206's role grants).
-- Affected tables: ledger_transactions, ledger_entries.
-- Rollback: DROP TRIGGER trg_ledger_transactions_immutable ON ledger_transactions;
--   DROP TRIGGER trg_ledger_entries_immutable ON ledger_entries;
--   DROP TRIGGER trg_ledger_balanced ON ledger_entries;
--   DROP TRIGGER trg_ledger_single_currency ON ledger_entries;
--   DROP FUNCTION fn_reject_mutation, fn_check_ledger_balanced, fn_check_ledger_single_currency;
-- Destructive: no (additive).

CREATE FUNCTION fn_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger rows are append-only: % on % is not permitted (RULE-F04)', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_transactions_immutable
  BEFORE UPDATE OR DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();

CREATE TRIGGER trg_ledger_entries_immutable
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();

CREATE FUNCTION fn_check_ledger_balanced() RETURNS trigger AS $$
DECLARE
  txn_sum bigint;
BEGIN
  SELECT COALESCE(SUM(signed_amount_minor), 0) INTO txn_sum
  FROM ledger_entries
  WHERE transaction_id = NEW.transaction_id;

  IF txn_sum <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % does not sum to zero (got %) (RULE-F05 / INV-02)',
      NEW.transaction_id, txn_sum;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_ledger_balanced
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION fn_check_ledger_balanced();

CREATE FUNCTION fn_check_ledger_single_currency() RETURNS trigger AS $$
DECLARE
  currency_count integer;
BEGIN
  SELECT COUNT(DISTINCT currency) INTO currency_count
  FROM ledger_entries
  WHERE transaction_id = NEW.transaction_id;

  IF currency_count > 1 THEN
    RAISE EXCEPTION 'ledger transaction % spans more than one currency (RULE-F16)', NEW.transaction_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_ledger_single_currency
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION fn_check_ledger_single_currency();
