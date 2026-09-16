"use client";

import { useState, type SyntheticEvent } from "react";
import { isValidAmountMinorInput } from "@/ui/money/Money";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

/** Fixed MVP economic constants (Claude/domain/BETTING_ENGINE.md §1: `odds_num = 18, odds_den =
 * 10`), integer bigint representation to avoid floating point — for the pre-submission estimate
 * shown to the user only. The confirmed order response is the only source of truth for actual
 * odds/matched/unmatched amounts once a bet is placed (UI.md §5). */
const FIXED_ODDS_NUM = 18n;
const FIXED_ODDS_DEN = 10n;

export interface BetOrderResponse {
  readonly id: string;
  readonly marketId: string;
  readonly outcomeId: string;
  readonly requestedMinor: string;
  readonly matchedMinor: string;
  readonly unmatchedMinor: string;
  readonly releasedMinor: string;
  readonly oddsNum: number;
  readonly oddsDen: number;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface BetFormProps {
  readonly marketId: string;
  readonly outcomeId: string;
  readonly currency: string;
  readonly onPlaced: (order: BetOrderResponse) => void;
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

type FormState =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | { readonly kind: "error"; readonly message: string };

export function BetForm({ marketId, outcomeId, currency, onPlaced }: BetFormProps) {
  const [amountMinor, setAmountMinor] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  const isValidAmount = isValidAmountMinorInput(amountMinor);
  const estimatedReturn = isValidAmount
    ? ((BigInt(amountMinor) * FIXED_ODDS_NUM) / FIXED_ODDS_DEN).toString()
    : null;

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidAmount) {
      return;
    }

    setState({ kind: "submitting" });

    try {
      const response = await fetch("/api/v1/bets", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          [CSRF_HEADER_NAME]: readCookie(CSRF_COOKIE_NAME) ?? "",
        },
        body: JSON.stringify({ marketId, outcomeId, amountMinor, currency }),
      });

      const body: unknown = await response.json();

      if (!response.ok) {
        const message = extractErrorMessage(body);
        setState({ kind: "error", message });
        return;
      }

      const { order } = body as { order: BetOrderResponse };
      setAmountMinor("");
      setState({ kind: "idle" });
      onPlaced(order);
    } catch {
      setState({ kind: "error", message: "network error — please try again" });
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="flex flex-col gap-3"
    >
      <label htmlFor="bet-amount" className="text-sm font-medium text-[var(--text-primary)]">
        Stake amount ({currency} minor units)
      </label>
      <input
        id="bet-amount"
        name="amountMinor"
        inputMode="numeric"
        value={amountMinor}
        onChange={(event) => {
          setAmountMinor(event.target.value);
        }}
        className="rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        aria-describedby="bet-amount-estimate"
      />
      <p id="bet-amount-estimate" className="text-sm text-[var(--text-muted)]">
        {estimatedReturn
          ? `Estimated return at fixed 1.8x odds if fully matched and you win: ${estimatedReturn} (before this bet is confirmed, actual odds and matched amount always come from the order response).`
          : "Enter a whole number of minor units to see an estimate."}
      </p>

      {state.kind === "error" && (
        <p role="alert" className="text-sm text-[var(--state-danger)]">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={!isValidAmount || state.kind === "submitting"}
        className="rounded bg-[var(--accent-primary)] px-4 py-2 font-medium text-[var(--accent-contrast)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        {state.kind === "submitting" ? "Placing bet…" : "Place bet"}
      </button>
    </form>
  );
}

function extractErrorMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "object"
  ) {
    const error = (body as { error: { code?: unknown; message?: unknown } }).error;
    if (error.code === "STALE_STATE") {
      return "This market changed while you were betting — please refresh and try again.";
    }
    if (typeof error.message === "string") {
      return error.message;
    }
  }
  return "unable to place bet";
}
