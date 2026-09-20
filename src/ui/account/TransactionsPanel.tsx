"use client";

import { useState } from "react";
import { Money } from "@/ui/money/Money";

export interface TransactionEntry {
  readonly id: string;
  readonly kind: string;
  readonly currency: string;
  readonly signedAmountMinor: string;
  readonly createdAt: string;
}

interface TransactionsMeta {
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

interface TransactionsResponse {
  readonly transactions: readonly TransactionEntry[];
  readonly meta: TransactionsMeta;
}

interface TransactionsPanelProps {
  readonly initialTransactions: readonly TransactionEntry[];
  readonly initialMeta: TransactionsMeta;
  readonly currency: string;
}

function toCsv(rows: readonly TransactionEntry[]): string {
  const header = "id,kind,currency,signed_amount_minor,created_at";
  const lines = rows.map((row) =>
    [row.id, row.kind, row.currency, row.signedAmountMinor, row.createdAt].join(","),
  );
  return [header, ...lines].join("\n");
}

function downloadCsv(csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "transactions.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/** Reads-only view over the caller's own `USER_AVAILABLE` ledger entries (T-805). CSV export
 * walks every page client-side rather than needing a dedicated export route — the same
 * `GET /api/v1/wallet/transactions` endpoint the page itself paginates through. */
export function TransactionsPanel({
  initialTransactions,
  initialMeta,
  currency,
}: TransactionsPanelProps) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [meta, setMeta] = useState(initialMeta);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(meta.total / meta.limit));

  async function fetchPage(page: number): Promise<TransactionsResponse> {
    const response = await fetch(
      `/api/v1/wallet/transactions?currency=${currency}&page=${String(page)}&limit=${String(meta.limit)}`,
      { credentials: "include" },
    );
    if (!response.ok) {
      throw new Error("failed to load transactions");
    }
    return response.json() as Promise<TransactionsResponse>;
  }

  async function goToPage(page: number) {
    setError(null);
    setLoading(true);
    try {
      const result = await fetchPage(page);
      setTransactions(result.transactions);
      setMeta(result.meta);
    } catch {
      setError("unable to load that page — please try again");
    } finally {
      setLoading(false);
    }
  }

  async function exportCsv() {
    setError(null);
    setExporting(true);
    try {
      const all: TransactionEntry[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const result = await fetchPage(page);
        all.push(...result.transactions);
        hasMore = all.length < result.meta.total;
        page += 1;
      }
      downloadCsv(toCsv(all));
    } catch {
      setError("unable to export transactions — please try again");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-sm text-[var(--state-danger)]">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          void exportCsv();
        }}
        disabled={exporting || meta.total === 0}
        className="self-start rounded border border-[var(--border-default)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        {exporting ? "Exporting…" : "Export CSV"}
      </button>

      {transactions.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">No transactions yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {transactions.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3"
            >
              <div>
                <p className="text-sm text-[var(--text-primary)]">{entry.kind}</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
              <Money amountMinor={entry.signedAmountMinor} currency={entry.currency} signed />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => {
              void goToPage(meta.page - 1);
            }}
            disabled={loading || meta.page <= 1}
            className="rounded border border-[var(--border-default)] px-3 py-1 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            Previous
          </button>
          <span className="text-[var(--text-secondary)]">
            Page {meta.page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => {
              void goToPage(meta.page + 1);
            }}
            disabled={loading || meta.page >= totalPages}
            className="rounded border border-[var(--border-default)] px-3 py-1 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
