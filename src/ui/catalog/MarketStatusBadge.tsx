import type { MarketStatus } from "@/domain/catalog";

const STATUS_COLOR: Record<MarketStatus, string> = {
  DRAFT: "bg-[var(--surface-2)] text-[var(--text-muted)]",
  OPEN: "bg-[var(--state-success)] text-[var(--surface-0)]",
  SUSPENDED: "bg-[var(--state-warning)] text-[var(--surface-0)]",
  CLOSED: "bg-[var(--state-info)] text-[var(--surface-0)]",
  SETTLING: "bg-[var(--state-info)] text-[var(--surface-0)]",
  SETTLED: "bg-[var(--surface-2)] text-[var(--text-primary)]",
  CANCELLED: "bg-[var(--state-danger)] text-[var(--surface-0)]",
  VOID: "bg-[var(--state-danger)] text-[var(--surface-0)]",
};

interface Props {
  status: MarketStatus;
}

export function MarketStatusBadge({ status }: Props) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[status]}`}
    >
      {status}
    </span>
  );
}
