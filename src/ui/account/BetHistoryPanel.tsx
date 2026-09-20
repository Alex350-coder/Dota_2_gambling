"use client";

import { useState } from "react";
import { Money } from "@/ui/money/Money";

interface BetHistoryOrder {
  readonly id: string;
  readonly marketId: string;
  readonly outcomeId: string;
  readonly requestedMinor: string;
  readonly matchedMinor: string;
  readonly unmatchedMinor: string;
  readonly status: string;
  readonly createdAt: string;
}

interface SettlementDetail {
  readonly allocationId: string;
  readonly matchedMinor: string;
  readonly returnMinor: string;
  readonly commissionMinor: string;
  readonly netMinor: string;
}

interface BetDetailResponse {
  readonly settlement: readonly SettlementDetail[];
}

interface BetHistoryMeta {
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

interface BetHistoryPanelProps {
  readonly initialOrders: readonly BetHistoryOrder[];
  readonly initialMeta: BetHistoryMeta;
  readonly currency: string;
}

/** Read-only bet history with on-demand settlement detail per order (T-806) — settlement rows
 * are fetched lazily via the existing `GET /api/v1/bets/{id}` detail route rather than joined
 * into the list response, since only a fraction of listed orders are ever expanded. */
export function BetHistoryPanel({ initialOrders, initialMeta, currency }: BetHistoryPanelProps) {
  const [orders, setOrders] = useState(initialOrders);
  const [meta, setMeta] = useState(initialMeta);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<readonly SettlementDetail[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(meta.total / meta.limit));

  async function goToPage(page: number) {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/bets?page=${String(page)}&limit=${String(meta.limit)}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        throw new Error("failed to load bets");
      }
      const body = (await response.json()) as {
        orders: readonly BetHistoryOrder[];
        meta: BetHistoryMeta;
      };
      setOrders(body.orders);
      setMeta(body.meta);
      setExpandedId(null);
      setSettlement(null);
    } catch {
      setError("unable to load that page — please try again");
    } finally {
      setLoading(false);
    }
  }

  async function toggleDetail(orderId: string) {
    if (expandedId === orderId) {
      setExpandedId(null);
      setSettlement(null);
      return;
    }
    setExpandedId(orderId);
    setSettlement(null);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/v1/bets/${orderId}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("failed to load settlement detail");
      }
      const body = (await response.json()) as BetDetailResponse;
      setSettlement(body.settlement);
    } catch {
      setError("unable to load settlement detail — please try again");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-sm text-[var(--state-danger)]">
          {error}
        </p>
      )}

      {orders.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">No bets placed yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex flex-col gap-3 rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3 text-[var(--text-primary)]"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">Order {order.id.slice(0, 8)}</span>
                <span className="text-sm text-[var(--text-secondary)]">{order.status}</span>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
                <dt>Requested</dt>
                <dd>
                  <Money amountMinor={order.requestedMinor} currency={currency} />
                </dd>
                <dt>Matched</dt>
                <dd>
                  <Money amountMinor={order.matchedMinor} currency={currency} />
                </dd>
                <dt>Unmatched</dt>
                <dd>
                  <Money amountMinor={order.unmatchedMinor} currency={currency} />
                </dd>
              </dl>

              {order.status === "SETTLED" && (
                <button
                  type="button"
                  onClick={() => {
                    void toggleDetail(order.id);
                  }}
                  className="self-start text-sm text-[var(--text-primary)] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  {expandedId === order.id ? "Hide settlement detail" : "View settlement detail"}
                </button>
              )}

              {expandedId === order.id && (
                <div className="flex flex-col gap-2 border-t border-[var(--border-default)] pt-2">
                  {detailLoading ? (
                    <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
                  ) : settlement && settlement.length > 0 ? (
                    <ul className="flex flex-col gap-2">
                      {settlement.map((detail) => (
                        <li
                          key={detail.allocationId}
                          className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]"
                        >
                          <dt>Return</dt>
                          <dd>
                            <Money amountMinor={detail.returnMinor} currency={currency} signed />
                          </dd>
                          <dt>Commission</dt>
                          <dd>
                            <Money amountMinor={detail.commissionMinor} currency={currency} />
                          </dd>
                          <dt>Net</dt>
                          <dd>
                            <Money amountMinor={detail.netMinor} currency={currency} signed />
                          </dd>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[var(--text-secondary)]">
                      No settlement detail available.
                    </p>
                  )}
                </div>
              )}
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
