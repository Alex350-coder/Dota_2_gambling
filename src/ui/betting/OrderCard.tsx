"use client";

import { useState } from "react";
import { Money } from "@/ui/money/Money";
import type { BetOrderResponse } from "./BetForm";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

/** UI-only projection over the stored `BetOrderStatus` (StateManagement.md §3) — never sent to
 * or received from the server. */
type DisplayStatus = string;

const CANCELLABLE_STATUSES = new Set(["PENDING", "OPEN"]);

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function displayStatus(order: BetOrderResponse): DisplayStatus {
  const matched = BigInt(order.matchedMinor);
  const requested = BigInt(order.requestedMinor);
  if (order.status === "OPEN" && matched > 0n && matched < requested) {
    return "PARTIALLY_MATCHED";
  }
  return order.status;
}

interface OrderCardProps {
  readonly order: BetOrderResponse;
  readonly currency: string;
  readonly onCancelled: (order: BetOrderResponse) => void;
}

export function OrderCard({ order, currency, onCancelled }: OrderCardProps) {
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = displayStatus(order);
  const canCancel = CANCELLABLE_STATUSES.has(order.status);

  async function handleCancel() {
    setIsCancelling(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/bets/${order.id}/cancel`, {
        method: "POST",
        credentials: "include",
        headers: {
          [CSRF_HEADER_NAME]: readCookie(CSRF_COOKIE_NAME) ?? "",
        },
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setError("unable to cancel this order — please refresh and try again");
        return;
      }
      const { order: cancelled } = body as { order: BetOrderResponse };
      onCancelled(cancelled);
    } catch {
      setError("network error — please try again");
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3 text-[var(--text-primary)]">
      <div className="flex items-center justify-between">
        <span className="font-medium">Order {order.id.slice(0, 8)}</span>
        <span className="text-sm text-[var(--text-secondary)]">{status}</span>
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

      {error && (
        <p role="alert" className="text-sm text-[var(--state-danger)]">
          {error}
        </p>
      )}

      {canCancel && (
        <button
          type="button"
          onClick={() => {
            void handleCancel();
          }}
          disabled={isCancelling}
          className="self-start rounded border border-[var(--border-default)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {isCancelling ? "Cancelling…" : "Cancel order"}
        </button>
      )}
    </div>
  );
}
