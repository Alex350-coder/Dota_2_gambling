"use client";

import { useState } from "react";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

interface SettlementRetryButtonProps {
  readonly runId: string;
  readonly status: string;
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/** T-906 — hits the idempotent retry route; only offered for a FAILED run. */
export function SettlementRetryButton({ runId, status }: SettlementRetryButtonProps) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function retry() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/v1/admin/settlements/${runId}/retry`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: readCookie(CSRF_COOKIE_NAME) ?? "",
        },
        body: "{}",
      });
      const body = (await response.json()) as {
        run?: { status: string };
        error?: { code: string };
      };
      if (!response.ok || !body.run) {
        setError(body.error?.code ?? "unable to retry this settlement run");
        return;
      }
      setCurrentStatus(body.run.status);
    } catch {
      setError("network error — please try again");
    } finally {
      setPending(false);
    }
  }

  if (currentStatus !== "FAILED") {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        Status: <span className="text-[var(--text-primary)]">{currentStatus}</span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-sm text-[var(--state-danger)]">
          {error}
        </p>
      )}
      <p className="text-sm text-[var(--text-secondary)]">
        Status: <span className="text-[var(--text-primary)]">{currentStatus}</span>
      </p>
      <button
        type="button"
        onClick={() => {
          void retry();
        }}
        disabled={pending}
        className="self-start rounded border border-[var(--border-default)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        {pending ? "Retrying…" : "Retry settlement"}
      </button>
    </div>
  );
}
