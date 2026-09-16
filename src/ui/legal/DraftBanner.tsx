interface DraftBannerProps {
  readonly version: string;
  readonly lastUpdated: string;
}

/** Every legal/policy page carries this banner while unreviewed (Claude/compliance/POLICIES.md §2/§3). */
export function DraftBanner({ version, lastUpdated }: DraftBannerProps) {
  return (
    <div
      role="note"
      aria-label="Draft status"
      className="rounded border border-[var(--state-warning)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-primary)]"
    >
      <p className="font-semibold">TECHNICAL DRAFT — REQUIRES LEGAL REVIEW</p>
      <p className="text-[var(--text-secondary)]">
        This document is written by engineers to describe how the system actually behaves. It is not
        legal advice and must not be treated as final terms for a real-money service.
      </p>
      <p className="mt-1 text-[var(--text-muted)]">
        Version {version} — last updated {lastUpdated}
      </p>
    </div>
  );
}
