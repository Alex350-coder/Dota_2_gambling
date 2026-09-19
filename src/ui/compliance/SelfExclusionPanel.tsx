"use client";

import { useState } from "react";

type SelfExclusionPeriod = "24H" | "7D" | "30D" | "6M" | "PERMANENT";

const PERIOD_LABELS: Record<SelfExclusionPeriod, string> = {
  "24H": "24 hours",
  "7D": "7 days",
  "30D": "30 days",
  "6M": "6 months",
  PERMANENT: "Permanent",
};

/**
 * Self-exclusion is irrevocable before `revocableAt` (RESPONSIBLE_GAMBLING.md §3) — the two-step
 * confirm exists so a single misclick can't lock the account out for the chosen period.
 */
export function SelfExclusionPanel() {
  const [period, setPeriod] = useState<SelfExclusionPeriod>("24H");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revocableAt, setRevocableAt] = useState<string | null>(null);
  const [excluded, setExcluded] = useState(false);

  async function confirm() {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/me/self-exclusion", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ period }),
      });
      if (!response.ok) {
        throw new Error("failed to self-exclude");
      }
      const body = (await response.json()) as { revocableAt: string | null };
      setRevocableAt(body.revocableAt);
      setExcluded(true);
      setConfirming(false);
    } catch {
      setError("unable to complete self-exclusion — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (excluded) {
    return (
      <p role="status" className="text-sm text-[var(--text-primary)]">
        Self-exclusion is active.{" "}
        {revocableAt
          ? `It cannot be lifted before ${new Date(revocableAt).toLocaleString()}.`
          : "It is permanent and cannot be lifted."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-sm text-[var(--state-danger)]">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <label className="text-sm text-[var(--text-secondary)]" htmlFor="self-exclusion-period">
          Exclusion period
        </label>
        <select
          id="self-exclusion-period"
          value={period}
          onChange={(event) => {
            setPeriod(event.target.value as SelfExclusionPeriod);
            setConfirming(false);
          }}
          className="rounded border border-[var(--border-default)] bg-[var(--surface-0)] px-2 py-1 text-sm text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {(Object.keys(PERIOD_LABELS) as SelfExclusionPeriod[]).map((value) => (
            <option key={value} value={value}>
              {PERIOD_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      {!confirming ? (
        <button
          type="button"
          onClick={() => {
            setConfirming(true);
          }}
          className="self-start rounded border border-[var(--state-danger)] px-3 py-1 text-sm text-[var(--state-danger)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          Self-exclude
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--text-primary)]">
            Confirm {PERIOD_LABELS[period]} self-exclusion — this cannot be undone early.
          </span>
          <button
            type="button"
            onClick={() => {
              void confirm();
            }}
            disabled={submitting}
            className="rounded border border-[var(--state-danger)] bg-[var(--state-danger)] px-3 py-1 text-sm text-[var(--surface-0)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
            }}
            className="rounded border border-[var(--border-default)] px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
