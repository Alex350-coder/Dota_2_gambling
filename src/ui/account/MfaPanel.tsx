"use client";

import { useState, type SyntheticEvent } from "react";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

interface MfaPanelProps {
  readonly initiallyEnabled: boolean;
}

interface EnrollResult {
  readonly otpAuthUri: string;
  readonly recoveryCodes: readonly string[];
}

type PanelState =
  | { readonly kind: "disabled" }
  | { readonly kind: "enrolling" }
  | { readonly kind: "pending-verify"; readonly enrollment: EnrollResult }
  | { readonly kind: "enabled" }
  | { readonly kind: "disabling" }
  | { readonly kind: "error"; readonly message: string; readonly previous: PanelState };

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
  return "unable to complete MFA request";
}

async function postJson(url: string, payload: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      [CSRF_HEADER_NAME]: readCookie(CSRF_COOKIE_NAME) ?? "",
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Disabling MFA requires re-proving the account password (DisableMfaUseCase, existing from
 * P3) — the disable form always asks for it, there is no other step-up path for that action.
 */
export function MfaPanel({ initiallyEnabled }: MfaPanelProps) {
  const [state, setState] = useState<PanelState>(
    initiallyEnabled ? { kind: "enabled" } : { kind: "disabled" },
  );
  const [code, setCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");

  async function startEnroll() {
    setState({ kind: "enrolling" });
    try {
      const response = await postJson("/api/v1/auth/mfa/enroll", {});
      const body: unknown = await response.json();
      if (!response.ok) {
        setState({
          kind: "error",
          message: extractErrorMessage(body),
          previous: { kind: "disabled" },
        });
        return;
      }
      setState({ kind: "pending-verify", enrollment: body as EnrollResult });
    } catch {
      setState({
        kind: "error",
        message: "network error — please try again",
        previous: { kind: "disabled" },
      });
    }
  }

  async function handleVerify(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const previous = state;
    try {
      const response = await postJson("/api/v1/auth/mfa/verify", { code });
      if (!response.ok) {
        const body: unknown = await response.json();
        setState({ kind: "error", message: extractErrorMessage(body), previous });
        return;
      }
      setCode("");
      setState({ kind: "enabled" });
    } catch {
      setState({ kind: "error", message: "network error — please try again", previous });
    }
  }

  async function handleDisable(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const previous = state;
    setState({ kind: "disabling" });
    try {
      const response = await postJson("/api/v1/auth/mfa/disable", { password: disablePassword });
      if (!response.ok) {
        const body: unknown = await response.json();
        setState({ kind: "error", message: extractErrorMessage(body), previous });
        return;
      }
      setDisablePassword("");
      setState({ kind: "disabled" });
    } catch {
      setState({ kind: "error", message: "network error — please try again", previous });
    }
  }

  const errorBanner =
    state.kind === "error" ? (
      <p role="alert" className="text-sm text-[var(--state-danger)]">
        {state.message}
      </p>
    ) : null;

  const effective = state.kind === "error" ? state.previous : state;

  return (
    <section className="flex flex-col gap-3 rounded border border-[var(--border-default)] bg-[var(--surface-1)] p-4">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">
        Two-factor authentication
      </h2>
      {errorBanner}

      {effective.kind === "disabled" && (
        <>
          <p className="text-sm text-[var(--text-secondary)]">
            Not enabled. Add an authenticator app for extra protection.
          </p>
          <button
            type="button"
            onClick={() => {
              void startEnroll();
            }}
            className="self-start rounded bg-[var(--accent-primary)] px-4 py-2 font-medium text-[var(--accent-primary-contrast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            Enable MFA
          </button>
        </>
      )}

      {effective.kind === "enrolling" && (
        <p className="text-sm text-[var(--text-secondary)]">Starting enrollment…</p>
      )}

      {effective.kind === "pending-verify" && (
        <form
          onSubmit={(event) => {
            void handleVerify(event);
          }}
          className="flex flex-col gap-3"
        >
          <p className="text-sm text-[var(--text-secondary)]">
            Scan this URI in your authenticator app, then enter the 6-digit code to confirm.
          </p>
          <code className="break-all rounded bg-[var(--surface-2)] p-2 text-xs">
            {effective.enrollment.otpAuthUri}
          </code>
          <p className="text-sm text-[var(--text-secondary)]">
            Save these recovery codes — each can be used once if you lose your device:
          </p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-xs">
            {effective.enrollment.recoveryCodes.map((rc) => (
              <li key={rc}>{rc}</li>
            ))}
          </ul>
          <label htmlFor="mfa-code" className="text-sm font-medium text-[var(--text-primary)]">
            Verification code
          </label>
          <input
            id="mfa-code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
            }}
            className="rounded border border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          />
          <button
            type="submit"
            className="self-start rounded bg-[var(--accent-primary)] px-4 py-2 font-medium text-[var(--accent-primary-contrast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            Confirm
          </button>
        </form>
      )}

      {effective.kind === "enabled" && (
        <form
          onSubmit={(event) => {
            void handleDisable(event);
          }}
          className="flex flex-col gap-3"
        >
          <p className="text-sm text-[var(--state-success)]">MFA is enabled on this account.</p>
          <label
            htmlFor="mfa-disable-password"
            className="text-sm font-medium text-[var(--text-primary)]"
          >
            Confirm your password to disable MFA
          </label>
          <input
            id="mfa-disable-password"
            type="password"
            value={disablePassword}
            onChange={(event) => {
              setDisablePassword(event.target.value);
            }}
            className="rounded border border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-2 text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          />
          <button
            type="submit"
            className="self-start rounded border border-[var(--state-danger)] px-4 py-2 font-medium text-[var(--state-danger)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            Disable MFA
          </button>
        </form>
      )}

      {effective.kind === "disabling" && (
        <p className="text-sm text-[var(--text-secondary)]">Disabling…</p>
      )}
    </section>
  );
}
