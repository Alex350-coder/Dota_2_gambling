import Link from "next/link";

export default function PublicNotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center text-[var(--text-primary)]">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-[var(--text-secondary)]">
        We couldn&apos;t find what you were looking for.
      </p>
      <Link
        href="/"
        className="rounded bg-[var(--accent-primary)] px-4 py-2 font-medium text-[var(--accent-contrast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        Back to home
      </Link>
    </div>
  );
}
