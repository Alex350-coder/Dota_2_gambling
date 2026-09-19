"use client";

import { useState } from "react";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

export interface SessionSummary {
  readonly id: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly expiresAt: string;
  readonly userAgent: string | null;
}

interface SessionsPanelProps {
  readonly initialSessions: readonly SessionSummary[];
  readonly currentSessionId: string;
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function csrfFetch(url: string, method: string): Promise<Response> {
  return fetch(url, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      [CSRF_HEADER_NAME]: readCookie(CSRF_COOKIE_NAME) ?? "",
    },
    body: method === "POST" ? "{}" : null,
  });
}

/** Revoking the session this page is loaded in isn't offered here — use logout for that
 * (same rationale RevokeSessionUseCase/RevokeAllSessionsUseCase document: exceptSessionId always
 * protects the caller's own active session, T-803). */
export function SessionsPanel({ initialSessions, currentSessionId }: SessionsPanelProps) {
  const [sessions, setSessions] = useState(initialSessions);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  async function revokeOne(sessionId: string) {
    setError(null);
    setRevokingId(sessionId);
    try {
      const response = await csrfFetch(`/api/v1/me/sessions/${sessionId}`, "DELETE");
      if (!response.ok) {
        setError("unable to revoke that session");
        return;
      }
      setSessions((current) => current.filter((s) => s.id !== sessionId));
    } catch {
      setError("network error — please try again");
    } finally {
      setRevokingId(null);
    }
  }

  async function revokeAll() {
    setError(null);
    setRevokingAll(true);
    try {
      const response = await csrfFetch("/api/v1/me/sessions/revoke-all", "POST");
      if (!response.ok) {
        setError("unable to revoke other sessions");
        return;
      }
      setSessions((current) => current.filter((s) => s.id === currentSessionId));
    } catch {
      setError("network error — please try again");
    } finally {
      setRevokingAll(false);
    }
  }

  const otherSessionCount = sessions.filter((s) => s.id !== currentSessionId).length;

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
          void revokeAll();
        }}
        disabled={revokingAll || otherSessionCount === 0}
        className="self-start rounded border border-[var(--state-danger)] px-4 py-2 text-sm font-medium text-[var(--state-danger)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        {revokingAll ? "Signing out…" : "Sign out other sessions"}
      </button>

      <ul className="flex flex-col gap-3">
        {sessions.map((session) => {
          const isCurrent = session.id === currentSessionId;
          return (
            <li
              key={session.id}
              className="flex flex-col gap-1 rounded border border-[var(--border-default)] bg-[var(--surface-1)] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm text-[var(--text-primary)]">
                  {session.userAgent ?? "Unknown device"}
                  {isCurrent && (
                    <span className="ml-2 text-xs text-[var(--state-success)]">(this session)</span>
                  )}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Last active {new Date(session.lastSeenAt).toLocaleString()}
                </p>
              </div>
              {!isCurrent && (
                <button
                  type="button"
                  onClick={() => {
                    void revokeOne(session.id);
                  }}
                  disabled={revokingId === session.id}
                  className="self-start rounded border border-[var(--border-default)] px-3 py-1 text-sm text-[var(--text-primary)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  {revokingId === session.id ? "Revoking…" : "Revoke"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
