"use client";

import { useState } from "react";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

interface Outcome {
  readonly id: string;
  readonly label: string;
}

interface ResultView {
  readonly id: string;
  readonly status: string;
  readonly proposedBy: string | null;
  readonly winningOutcomeId: string | null;
}

interface ResultActionsProps {
  readonly marketId: string;
  readonly outcomes: readonly Outcome[];
  readonly result: ResultView | null;
  readonly viewerUserId: string;
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

interface ErrorBannerProps {
  readonly error: string | null;
}

function ErrorBanner({ error }: ErrorBannerProps) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-[var(--state-danger)]">
      {error}
    </p>
  );
}

interface ProposeFormProps {
  readonly outcomes: readonly Outcome[];
  readonly pending: boolean;
  readonly onPropose: (outcomeId: string) => void;
}

function ProposeForm({ outcomes, pending, onPropose }: ProposeFormProps) {
  const [selectedOutcome, setSelectedOutcome] = useState(outcomes[0]?.id ?? "");

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
        Winning outcome
        <select
          value={selectedOutcome}
          onChange={(event) => {
            setSelectedOutcome(event.target.value);
          }}
          className="rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-2 py-1 text-[var(--text-primary)]"
        >
          {outcomes.map((outcome) => (
            <option key={outcome.id} value={outcome.id}>
              {outcome.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => {
          onPropose(selectedOutcome);
        }}
        disabled={pending || !selectedOutcome}
        className="self-start rounded border border-[var(--border-default)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        Propose result
      </button>
    </div>
  );
}

interface ExistingResultPanelProps {
  readonly result: ResultView;
  readonly isProposer: boolean;
  readonly pending: boolean;
  readonly onConfirm: () => void;
  readonly onDispute: () => void;
}

/**
 * T-905 — the 4-eyes rule (RESULT_PROVIDERS.md §4/§5): the server (`confirm.ts:59-65`) is the
 * only real authority, rejecting `actorId === proposedBy` with UNAUTHORIZED_OPERATION. `isProposer`
 * mirrors that check purely so the proposer never even sees a Confirm control.
 */
function ExistingResultPanel({
  result,
  isProposer,
  pending,
  onConfirm,
  onDispute,
}: ExistingResultPanelProps) {
  const isProposed = result.status === "PROPOSED";

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-[var(--text-secondary)]">
        Status: <span className="text-[var(--text-primary)]">{result.status}</span>
      </p>
      {isProposer && isProposed && (
        <p className="text-sm text-[var(--text-secondary)]">
          You proposed this result — a different admin must confirm it.
        </p>
      )}
      <div className="flex gap-2">
        {isProposed && !isProposer && (
          <button
            type="button"
            data-testid="confirm-result"
            onClick={onConfirm}
            disabled={pending}
            className="rounded border border-[var(--state-success)] px-4 py-2 text-sm font-medium text-[var(--state-success)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            Confirm
          </button>
        )}
        {isProposed && (
          <button
            type="button"
            onClick={onDispute}
            disabled={pending}
            className="rounded border border-[var(--state-danger)] px-4 py-2 text-sm font-medium text-[var(--state-danger)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            Dispute
          </button>
        )}
      </div>
    </div>
  );
}

export function ResultActions({ marketId, outcomes, result, viewerUserId }: ResultActionsProps) {
  const [currentResult, setCurrentResult] = useState(result);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function propose(winningOutcomeId: string) {
    setError(null);
    setPending(true);
    try {
      const response = await csrfPost(`/api/v1/admin/markets/${marketId}/results`, {
        winningOutcomeId,
        rawPayload: { source: "admin-console" },
      });
      const body = (await response.json()) as { result?: ResultView; error?: { code: string } };
      if (!response.ok || !body.result) {
        setError(body.error?.code ?? "unable to propose a result");
        return;
      }
      setCurrentResult(body.result);
    } catch {
      setError("network error — please try again");
    } finally {
      setPending(false);
    }
  }

  async function confirmOrDispute(action: "confirm" | "dispute") {
    if (!currentResult) return;
    setError(null);
    setPending(true);
    try {
      const response = await csrfPost(`/api/v1/admin/results/${currentResult.id}/${action}`, {});
      const body = (await response.json()) as { result?: ResultView; error?: { code: string } };
      if (!response.ok || !body.result) {
        setError(body.error?.code ?? `unable to ${action} the result`);
        return;
      }
      setCurrentResult(body.result);
    } catch {
      setError("network error — please try again");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <ErrorBanner error={error} />
      {currentResult && currentResult.status !== "DISPUTED" ? (
        <ExistingResultPanel
          result={currentResult}
          isProposer={currentResult.proposedBy === viewerUserId}
          pending={pending}
          onConfirm={() => {
            void confirmOrDispute("confirm");
          }}
          onDispute={() => {
            void confirmOrDispute("dispute");
          }}
        />
      ) : (
        <ProposeForm
          outcomes={outcomes}
          pending={pending}
          onPropose={(outcomeId) => {
            void propose(outcomeId);
          }}
        />
      )}
    </>
  );
}
