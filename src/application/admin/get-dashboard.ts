import type { AdminDashboardReader, RiskAlertRepository, UnitOfWork } from "@/domain/ports";

export interface AdminDashboardView {
  readonly openMarketCount: number;
  readonly totalEscrowMinor: string;
  readonly pendingSettlementRunCount: number;
  readonly failedSettlementRunCount: number;
  readonly openRiskAlertCount: number;
}

export interface GetAdminDashboardDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly dashboard: (tx: Tx) => AdminDashboardReader;
  readonly riskAlerts: (tx: Tx) => RiskAlertRepository;
}

/**
 * T-902 — every figure is read fresh from the ledger/markets/settlement_runs/risk_alerts
 * tables inside one transaction, never cached, so the dashboard can never disagree with
 * `pnpm reconcile`. Read-only, no PII, so unlike T-903's user reads this view is not itself
 * audited (OBSERVABILITY.md §1 requires auditing admin reads of *another user's* data, not
 * aggregate platform figures).
 */
export class GetAdminDashboardUseCase<Tx> {
  constructor(private readonly deps: GetAdminDashboardDeps<Tx>) {}

  async execute(): Promise<AdminDashboardView> {
    return this.deps.uow.run(async (tx) => {
      const [summary, openRiskAlertCount] = await Promise.all([
        this.deps.dashboard(tx).getSummary(),
        this.deps.riskAlerts(tx).countOpen(),
      ]);

      return {
        openMarketCount: summary.openMarketCount,
        totalEscrowMinor: summary.totalEscrowMinor.toString(),
        pendingSettlementRunCount: summary.pendingSettlementRunCount,
        failedSettlementRunCount: summary.failedSettlementRunCount,
        openRiskAlertCount,
      };
    });
  }
}
