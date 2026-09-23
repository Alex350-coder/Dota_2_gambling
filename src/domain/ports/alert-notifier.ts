export type AlertSeverity = "P1" | "P2" | "P3";

export interface AlertInput {
  readonly severity: AlertSeverity;
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/**
 * T-912 — a swappable sink for OBSERVABILITY.md §5's alert table (reconciliation failure,
 * duplicate settlement, negative balance, non-zero escrow on a settled market — all P1s that
 * "stop money movement first, then investigate"). The default implementation logs; a real
 * paging integration (PagerDuty, Slack, etc.) can implement this same port later without
 * touching any caller.
 */
export interface AlertNotifier {
  notify(alert: AlertInput): Promise<void>;
}
