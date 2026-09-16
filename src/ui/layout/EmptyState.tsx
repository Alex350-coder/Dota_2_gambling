interface EmptyStateProps {
  readonly message: string;
}

/** Shared empty-state presentation for list pages with no items yet (T-714). */
export function EmptyState({ message }: EmptyStateProps) {
  return <p className="text-[var(--text-muted)]">{message}</p>;
}
