"use client";

import { useState } from "react";
import { Money } from "@/ui/money/Money";

export interface LimitRow {
  readonly kind: "DEPOSIT" | "STAKE" | "LOSS" | "SESSION_TIME" | "SINGLE_BET";
  readonly period: "DAY" | "WEEK" | "MONTH" | "SESSION" | "PER_BET";
  readonly currentValue: string;
  readonly pendingValue: string | null;
  readonly effectiveAt: string | null;
  readonly effectiveValue: string;
}

interface LimitsPanelProps {
  readonly initialLimits: readonly LimitRow[];
  readonly currency: string;
}

const LIMIT_LABELS: Record<LimitRow["kind"], string> = {
  DEPOSIT: "Deposit",
  STAKE: "Stake",
  LOSS: "Loss",
  SESSION_TIME: "Session time",
  SINGLE_BET: "Single bet",
};

/** `SESSION_TIME` is measured in minutes, not money — every other kind is a minor-unit amount
 * (RESPONSIBLE_GAMBLING.md §2). */
function isMinuteLimit(kind: LimitRow["kind"]): boolean {
  return kind === "SESSION_TIME";
}

/**
 * Editable RG limits (T-812). Lowering a limit applies immediately; raising one defers 24h
 * (`applyLimitChange`, RULE-K07) — the row's `pendingValue`/`effectiveAt` reflect that directly
 * from the API response, no client-side guessing of which branch was taken.
 */
export function LimitsPanel({ initialLimits, currency }: LimitsPanelProps) {
  const [limits, setLimits] = useState(initialLimits);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function rowKey(row: Pick<LimitRow, "kind" | "period">): string {
    return `${row.kind}:${row.period}`;
  }

  async function submit(row: LimitRow) {
    const key = rowKey(row);
    const draft = drafts[key];
    if (draft === undefined || draft === "") {
      return;
    }
    setError(null);
    setPending(key);
    try {
      const response = await fetch("/api/v1/me/limits", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: row.kind, period: row.period, value: draft }),
      });
      if (!response.ok) {
        throw new Error("failed to update limit");
      }
      const body = (await response.json()) as { limit: LimitRow };
      setLimits((current) => current.map((entry) => (rowKey(entry) === key ? body.limit : entry)));
      setDrafts((current) => ({ ...current, [key]: "" }));
    } catch {
      setError("unable to update that limit — please try again");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-sm text-[var(--state-danger)]">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {limits.map((row) => {
          const key = rowKey(row);
          return (
            <li
              key={key}
              className="flex flex-col gap-2 rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--text-primary)]">
                  {LIMIT_LABELS[row.kind]} ({row.period.toLowerCase()})
                </span>
                <span className="text-sm text-[var(--text-secondary)]">
                  {isMinuteLimit(row.kind) ? (
                    `${row.effectiveValue} min`
                  ) : (
                    <Money amountMinor={row.effectiveValue} currency={currency} />
                  )}
                </span>
              </div>

              {row.pendingValue !== null && row.effectiveAt !== null && (
                <p className="text-xs text-[var(--text-secondary)]">
                  Pending change to{" "}
                  {isMinuteLimit(row.kind) ? (
                    `${row.pendingValue} min`
                  ) : (
                    <Money amountMinor={row.pendingValue} currency={currency} />
                  )}{" "}
                  takes effect {new Date(row.effectiveAt).toLocaleString()}.
                </p>
              )}

              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`limit-${key}`}>
                  New {LIMIT_LABELS[row.kind]} limit
                </label>
                <input
                  id={`limit-${key}`}
                  type="text"
                  inputMode="numeric"
                  placeholder="new value"
                  value={drafts[key] ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDrafts((current) => ({ ...current, [key]: value }));
                  }}
                  className="w-32 rounded border border-[var(--border-default)] bg-[var(--surface-0)] px-2 py-1 text-sm text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                />
                <button
                  type="button"
                  onClick={() => {
                    void submit(row);
                  }}
                  disabled={pending === key}
                  className="rounded border border-[var(--border-default)] px-3 py-1 text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  Update
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
