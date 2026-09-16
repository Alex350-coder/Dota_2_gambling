export default function PublicLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3 py-8">
      <span className="sr-only">Loading…</span>
      <div className="h-6 w-1/3 animate-pulse rounded bg-[var(--surface-2)]" />
      <div className="h-24 w-full animate-pulse rounded bg-[var(--surface-2)]" />
      <div className="h-24 w-full animate-pulse rounded bg-[var(--surface-2)]" />
    </div>
  );
}
