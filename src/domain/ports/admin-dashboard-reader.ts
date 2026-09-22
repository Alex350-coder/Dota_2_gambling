export interface AdminDashboardSummary {
  readonly openMarketCount: number;
  readonly totalEscrowMinor: bigint;
  readonly pendingSettlementRunCount: number;
  readonly failedSettlementRunCount: number;
}

/**
 * Read-only aggregate for the admin dashboard (T-902) — every figure is derived from the
 * ledger/markets/settlement_runs tables directly (never a cached/denormalised total), so the
 * dashboard can never show a number `pnpm reconcile` would disagree with.
 */
export interface AdminDashboardReader {
  getSummary(): Promise<AdminDashboardSummary>;
}
