"use client";

import { useState, type SyntheticEvent } from "react";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

interface UpdateEmailFormProps {
  readonly currentEmail: string;
}

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
  return "unable to update email";
}

/**
 * Submitting the current, unchanged email is a legitimate no-op (UpdateProfileUseCase T-801)
 * rather than a form error — the API returns 200 either way.
 */
export function UpdateEmailForm({ currentEmail }: UpdateEmailFormProps) {
  const [email, setEmail] = useState(currentEmail);
  const [state, setState] = useState<FormState>({ kind: "idle" });

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "submitting" });

    try {
      const response = await fetch("/api/v1/me", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: readCookie(CSRF_COOKIE_NAME) ?? "",
        },
        body: JSON.stringify({ email }),
      });

      const body: unknown = await response.json();

      if (!response.ok) {
        setState({ kind: "error", message: extractErrorMessage(body) });
        return;
      }

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
      <label htmlFor="account-email" className="text-sm font-medium text-[var(--text-primary)]">
        Email address
      </label>
      <input
        id="account-email"
        name="email"
        type="email"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
        className="rounded border border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        aria-invalid={state.kind === "error"}
        aria-describedby={state.kind === "error" ? "account-email-error" : undefined}
      />
      <p className="text-sm text-[var(--text-muted)]">
        Changing your email requires re-verifying it before you can use it to sign in again.
      </p>

      {state.kind === "error" && (
        <p id="account-email-error" role="alert" className="text-sm text-[var(--state-danger)]">
          {state.message}
        </p>
      )}
      {state.kind === "success" && (
        <p role="status" className="text-sm text-[var(--state-success)]">
          Saved. If you changed your email, check your inbox to verify it.
        </p>
      )}

      <button
        type="submit"
        disabled={state.kind === "submitting"}
        className="self-start rounded bg-[var(--accent-primary)] px-4 py-2 font-medium text-[var(--accent-primary-contrast)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        {state.kind === "submitting" ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
