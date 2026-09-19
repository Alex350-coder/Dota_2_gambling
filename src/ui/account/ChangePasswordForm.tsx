"use client";

import { useState, type SyntheticEvent } from "react";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

type FormState =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "success" };

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function extractErrorMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "object"
  ) {
    const error = (body as { error: { message?: unknown } }).error;
    if (typeof error.message === "string") {
      return error.message;
    }
  }
  return "unable to change password";
}

/**
 * Re-auth here means re-proving the current password (ChangePasswordUseCase, T-802) — same
 * step-up concept as MFA disable, since this is the authenticated in-account change, not the
 * mailed-token reset flow. Success revokes every other session, so this browser's session
 * cookie stays valid but the page still tells the user other devices were signed out.
 */
export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "submitting" });

    try {
      const response = await fetch("/api/v1/me/password", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: readCookie(CSRF_COOKIE_NAME) ?? "",
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!response.ok) {
        const body: unknown = await response.json();
        setState({ kind: "error", message: extractErrorMessage(body) });
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setState({ kind: "success" });
    } catch {
      setState({ kind: "error", message: "network error — please try again" });
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="flex flex-col gap-3 rounded border border-[var(--border-default)] bg-[var(--surface-1)] p-4"
    >
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">Change password</h2>
      <label htmlFor="current-password" className="text-sm font-medium text-[var(--text-primary)]">
        Current password
      </label>
      <input
        id="current-password"
        type="password"
        value={currentPassword}
        onChange={(event) => {
          setCurrentPassword(event.target.value);
        }}
        className="rounded border border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        aria-invalid={state.kind === "error"}
        aria-describedby={state.kind === "error" ? "change-password-error" : undefined}
      />
      <label htmlFor="new-password" className="text-sm font-medium text-[var(--text-primary)]">
        New password
      </label>
      <input
        id="new-password"
        type="password"
        value={newPassword}
        onChange={(event) => {
          setNewPassword(event.target.value);
        }}
        minLength={12}
        maxLength={128}
        className="rounded border border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      />

      {state.kind === "error" && (
        <p id="change-password-error" role="alert" className="text-sm text-[var(--state-danger)]">
          {state.message}
        </p>
      )}
      {state.kind === "success" && (
        <p role="status" className="text-sm text-[var(--state-success)]">
          Password changed. Every other session has been signed out.
        </p>
      )}

      <button
        type="submit"
        disabled={state.kind === "submitting"}
        className="self-start rounded bg-[var(--accent-primary)] px-4 py-2 font-medium text-[var(--accent-primary-contrast)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        {state.kind === "submitting" ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
