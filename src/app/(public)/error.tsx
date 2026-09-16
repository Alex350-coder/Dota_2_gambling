"use client";

/** Root error boundary for the (public) route tree. Next.js only forwards `message` and
 * `digest` here — never the original error's stack or cause — so this can never leak internals
 * beyond what the server already redacted (Claude/ErrorHandling.md §1). */
interface PublicErrorProps {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}

export default function PublicError({ error, reset }: PublicErrorProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center text-[var(--text-primary)]">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-[var(--text-secondary)]">
        We couldn&apos;t load this page. No simulated funds are affected by this error.
      </p>
      {error.digest && (
        <p className="text-sm text-[var(--text-muted)]">Reference: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="rounded bg-[var(--accent-primary)] px-4 py-2 font-medium text-[var(--accent-contrast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        Try again
      </button>
    </div>
  );
}
