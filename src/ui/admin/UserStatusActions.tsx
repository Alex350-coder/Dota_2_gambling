"use client";

import { useState } from "react";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

interface UserStatusActionsProps {
  readonly userId: string;
  readonly status: string;
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function csrfPost(url: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      [CSRF_HEADER_NAME]: readCookie(CSRF_COOKIE_NAME) ?? "",
    },
    body: "{}",
  });
}

/**
 * T-903 — both routes require a recent step-up verification (Security.md §7); a stale/missing
 * one surfaces the server's `MFA_REQUIRED` error here rather than silently failing (the UI does
 * not attempt to drive the MFA re-auth flow itself — that's the existing account/security page).
 */
export function UserStatusActions({ userId, status }: UserStatusActionsProps) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function act(action: "suspend" | "restore") {
    setError(null);
    setPending(true);
    try {
      const response = await csrfPost(`/api/v1/admin/users/${userId}/${action}`);
      const body = (await response.json()) as {
        user?: { status: string };
        error?: { code: string };
      };
      if (!response.ok || !body.user) {
        setError(body.error?.code ?? "unable to complete this action");
        return;
      }
      setCurrentStatus(body.user.status);
    } catch {
      setError("network error — please try again");
    } finally {
      setPending(false);
    }
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
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            void act("suspend");
          }}
          disabled={pending || currentStatus === "SUSPENDED" || currentStatus === "CLOSED"}
          className="rounded border border-[var(--state-danger)] px-4 py-2 text-sm font-medium text-[var(--state-danger)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          Suspend
        </button>
        <button
          type="button"
          onClick={() => {
            void act("restore");
          }}
          disabled={pending || currentStatus !== "SUSPENDED"}
          className="rounded border border-[var(--border-default)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          Restore
        </button>
      </div>
    </div>
  );
}
