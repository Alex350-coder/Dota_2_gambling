import type { PoolClient } from "pg";

export interface ReconcileResult {
  readonly id: string;
  readonly status: "PASS" | "FAIL";
  readonly detail: string;
}

interface Check {
  readonly id: string;
  readonly description: string;
  readonly sql: string;
}

/** Each query returns the offending rows — zero rows means the invariant holds. */
const CHECKS: readonly Check[] = [
  {
    id: "INV-01",
    description: "SUM(ledger_entries.signed_amount_minor) = 0 globally, per currency",
    sql: `
      SELECT currency, SUM(signed_amount_minor) AS total
      FROM ledger_entries
      GROUP BY currency
      HAVING SUM(signed_amount_minor) <> 0
    `,
  },
  {
    id: "INV-02",
    description: "For each transaction, SUM(signed_amount_minor) = 0",
    sql: `
      SELECT transaction_id, SUM(signed_amount_minor) AS total
      FROM ledger_entries
      GROUP BY transaction_id
      HAVING SUM(signed_amount_minor) <> 0
    `,
  },
  {
    id: "INV-03",
    description: "wallets.available_minor = balance(USER_AVAILABLE:u) for every user",
    sql: `
      SELECT w.user_id, w.currency, w.available_minor,
             COALESCE(SUM(e.signed_amount_minor), 0) AS ledger_available
      FROM wallets w
      LEFT JOIN ledger_entries e
        ON e.account_key = 'USER_AVAILABLE:' || w.user_id::text AND e.currency = w.currency
      GROUP BY w.user_id, w.currency, w.available_minor
      HAVING w.available_minor <> COALESCE(SUM(e.signed_amount_minor), 0)
    `,
  },
  {
    id: "INV-04",
    description: "wallets.locked_minor = balance(USER_LOCKED:u) for every user",
    sql: `
      SELECT w.user_id, w.currency, w.locked_minor,
             COALESCE(SUM(e.signed_amount_minor), 0) AS ledger_locked
      FROM wallets w
      LEFT JOIN ledger_entries e
        ON e.account_key = 'USER_LOCKED:' || w.user_id::text AND e.currency = w.currency
      GROUP BY w.user_id, w.currency, w.locked_minor
      HAVING w.locked_minor <> COALESCE(SUM(e.signed_amount_minor), 0)
    `,
  },
  {
    id: "INV-05",
    description: "available_minor >= 0 and locked_minor >= 0",
    sql: `
      SELECT user_id, currency, available_minor, locked_minor
      FROM wallets
      WHERE available_minor < 0 OR locked_minor < 0
    `,
  },
  {
    id: "INV-06",
    description: "balance(MARKET_ESCROW:M) = 2 x SUM(matched_minor of ACTIVE allocations of M)",
    sql: `
      SELECT m.id AS market_id,
             COALESCE(escrow.balance, 0) AS escrow_balance,
             COALESCE(alloc.active_total, 0) * 2 AS expected_balance
      FROM markets m
      LEFT JOIN (
        SELECT SUBSTRING(account_key FROM '^MARKET_ESCROW:(.*)$')::uuid AS market_id,
               SUM(signed_amount_minor) AS balance
        FROM ledger_entries
        WHERE account_key LIKE 'MARKET_ESCROW:%'
        GROUP BY 1
      ) escrow ON escrow.market_id = m.id
      LEFT JOIN (
        SELECT market_id, SUM(matched_minor) AS active_total
        FROM match_allocations
        WHERE status = 'ACTIVE'
        GROUP BY market_id
      ) alloc ON alloc.market_id = m.id
      WHERE COALESCE(escrow.balance, 0) <> COALESCE(alloc.active_total, 0) * 2
    `,
  },
  {
    id: "INV-07",
    description: "After a market reaches SETTLED or VOID, balance(MARKET_ESCROW:M) = 0",
    sql: `
      SELECT m.id AS market_id, m.status, COALESCE(escrow.balance, 0) AS escrow_balance
      FROM markets m
      LEFT JOIN (
        SELECT SUBSTRING(account_key FROM '^MARKET_ESCROW:(.*)$')::uuid AS market_id,
               SUM(signed_amount_minor) AS balance
        FROM ledger_entries
        WHERE account_key LIKE 'MARKET_ESCROW:%'
        GROUP BY 1
      ) escrow ON escrow.market_id = m.id
      WHERE m.status IN ('SETTLED', 'VOID') AND COALESCE(escrow.balance, 0) <> 0
    `,
  },
  {
    id: "INV-08",
    description: "For each order: requested = matched + unmatched + released",
    sql: `
      SELECT id, requested_minor, matched_minor, unmatched_minor, released_minor
      FROM bet_orders
      WHERE requested_minor <> matched_minor + unmatched_minor + released_minor
    `,
  },
  {
    id: "INV-09",
    description: "For each order: matched = SUM(allocations.matched_minor)",
    sql: `
      SELECT bo.id AS order_id, bo.matched_minor, COALESCE(alloc.total, 0) AS allocation_total
      FROM bet_orders bo
      LEFT JOIN (
        SELECT order_id, SUM(matched_minor) AS total
        FROM (
          SELECT order_a_id AS order_id, matched_minor FROM match_allocations
          UNION ALL
          SELECT order_b_id AS order_id, matched_minor FROM match_allocations
        ) sides
        GROUP BY order_id
      ) alloc ON alloc.order_id = bo.id
      WHERE bo.matched_minor <> COALESCE(alloc.total, 0)
    `,
  },
  {
    id: "INV-10",
    description: "For each allocation: payout + commission = 2 x matched_minor",
    sql: `
      SELECT ma.id AS allocation_id, ma.matched_minor,
             SUM(le.signed_amount_minor) FILTER (WHERE le.signed_amount_minor > 0) AS credited
      FROM match_allocations ma
      JOIN ledger_transactions lt
        ON lt.reference_type = 'match_allocation'
       AND lt.reference_id = ma.id
       AND lt.kind IN ('SETTLE_PAYOUT', 'SETTLE_COMMISSION')
      JOIN ledger_entries le ON le.transaction_id = lt.id
      GROUP BY ma.id, ma.matched_minor
      HAVING COALESCE(SUM(le.signed_amount_minor) FILTER (WHERE le.signed_amount_minor > 0), 0)
             <> ma.matched_minor * 2
    `,
  },
  {
    id: "INV-11",
    description:
      "No UPDATE/DELETE has ever occurred on ledger tables (immutability triggers intact)",
    sql: `
      SELECT expected.tgname
      FROM (VALUES
        ('trg_ledger_transactions_immutable'),
        ('trg_ledger_entries_immutable')
      ) AS expected(tgname)
      LEFT JOIN pg_trigger t
        ON t.tgname = expected.tgname AND t.tgenabled <> 'D'
      WHERE t.tgname IS NULL
    `,
  },
  {
    id: "INV-12",
    description: "balance(STREAMER_PAYABLE:s) >= 0 for every streamer",
    sql: `
      SELECT SUBSTRING(account_key FROM '^STREAMER_PAYABLE:(.*)$') AS streamer_id,
             SUM(signed_amount_minor) AS balance
      FROM ledger_entries
      WHERE account_key LIKE 'STREAMER_PAYABLE:%'
      GROUP BY 1
      HAVING SUM(signed_amount_minor) < 0
    `,
  },
  {
    id: "INV-13",
    description:
      "SUM(user available + locked + escrow + streamer payable + platform revenue) = -(EXTERNAL_FUNDING + SIMULATION_FAUCET)",
    sql: `
      SELECT currency,
             SUM(signed_amount_minor) FILTER (
               WHERE account_key ~ '^(USER_AVAILABLE|USER_LOCKED|MARKET_ESCROW|STREAMER_PAYABLE):'
                  OR account_key = 'PLATFORM_REVENUE'
             ) AS internal_total,
             SUM(signed_amount_minor) FILTER (
               WHERE account_key IN ('EXTERNAL_FUNDING', 'SIMULATION_FAUCET')
             ) AS external_total
      FROM ledger_entries
      GROUP BY currency
      HAVING COALESCE(SUM(signed_amount_minor) FILTER (
               WHERE account_key ~ '^(USER_AVAILABLE|USER_LOCKED|MARKET_ESCROW|STREAMER_PAYABLE):'
                  OR account_key = 'PLATFORM_REVENUE'
             ), 0)
             <> -COALESCE(SUM(signed_amount_minor) FILTER (
               WHERE account_key IN ('EXTERNAL_FUNDING', 'SIMULATION_FAUCET')
             ), 0)
    `,
  },
  {
    id: "INV-14",
    description: "Every allocation has at most one SETTLE_PAYOUT transaction",
    sql: `
      SELECT reference_id AS allocation_id, COUNT(*) AS payout_count
      FROM ledger_transactions
      WHERE reference_type = 'match_allocation' AND kind = 'SETTLE_PAYOUT'
      GROUP BY reference_id
      HAVING COUNT(*) > 1
    `,
  },
  {
    id: "INV-15",
    description: "No two ledger transactions share an idempotency_key",
    sql: `
      SELECT idempotency_key, COUNT(*) AS occurrences
      FROM ledger_transactions
      GROUP BY idempotency_key
      HAVING COUNT(*) > 1
    `,
  },
];

export async function runReconcileCheck(
  client: PoolClient,
  check: Check,
): Promise<ReconcileResult> {
  const result = await client.query(check.sql);

  if (result.rows.length === 0) {
    return { id: check.id, status: "PASS", detail: check.description };
  }

  return {
    id: check.id,
    status: "FAIL",
    detail: `${check.description} — ${String(result.rows.length)} violating row(s): ${JSON.stringify(result.rows.slice(0, 10))}`,
  };
}

export async function runAllReconcileChecks(
  client: PoolClient,
): Promise<readonly ReconcileResult[]> {
  const results: ReconcileResult[] = [];
  for (const check of CHECKS) {
    results.push(await runReconcileCheck(client, check));
  }
  return results;
}
