"use client";

import { useState } from "react";
import { adminReachableMarketStates } from "./market-transitions";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

interface MarketActionsProps {
  readonly marketId: string;
  readonly status: string;
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function csrfPost(url: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      [CSRF_HEADER_NAME]: readCookie(CSRF_COOKIE_NAME) ?? "",
    },
    body: JSON.stringify(body),
  });
}

/**
 * T-904 — only offers `adminReachableMarketStates(status)` transitions plus Settle (when
 * CLOSED); every action still goes through the existing, already-guarded
 * `POST /admin/markets/{id}/transition|/settle|/void` routes (T-407/T-613) — this component
 * adds no new transition logic, it only decides which buttons to render.
 */
export function MarketActions({ marketId, status }: MarketActionsProps) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function transitionTo(to: string) {
    setError(null);
    setPending(to);
    try {
      const response = await csrfPost(`/api/v1/admin/markets/${marketId}/transition`, {
        to,
        ...(to === "CLOSED" ? { manualClose: true } : {}),
        ...(to === "VOID" ? { matchPlayed: false } : {}),
      });
      const body = (await response.json()) as {
        market?: { status: string };
        error?: { code: string };
      };
      if (!response.ok || !body.market) {
        setError(body.error?.code ?? "unable to complete this action");
        return;
      }
      setCurrentStatus(body.market.status);
    } catch {
      setError("network error — please try again");
    } finally {
      setPending(null);
    }
  }

  async function settle() {
    setError(null);
    setPending("SETTLE");
    try {
      const response = await csrfPost(`/api/v1/admin/markets/${marketId}/settle`, {});
      const body = (await response.json()) as { run?: unknown; error?: { code: string } };
      if (!response.ok || !body.run) {
        setError(body.error?.code ?? "unable to start settlement");
        return;
      }
      setCurrentStatus("SETTLING");
    } catch {
      setError("network error — please try again");
    } finally {
      setPending(null);
    }
  }

  const nextStates = adminReachableMarketStates(currentStatus);

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
      <div className="flex flex-wrap gap-2">
        {nextStates.map((to) => (
          <button
            key={to}
            type="button"
            onClick={() => {
              void transitionTo(to);
            }}
            disabled={pending !== null}
            className="rounded border border-[var(--border-default)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            {pending === to ? "…" : to}
          </button>
        ))}
        {currentStatus === "CLOSED" && (
          <button
            type="button"
            onClick={() => {
              void settle();
            }}
            disabled={pending !== null}
            className="rounded border border-[var(--state-success)] px-4 py-2 text-sm font-medium text-[var(--state-success)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            {pending === "SETTLE" ? "…" : "Settle"}
          </button>
        )}
      </div>
    </div>
  );
}
