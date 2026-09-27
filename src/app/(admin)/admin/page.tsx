import { getContainer } from "@/platform/http/container";
import { Money } from "@/ui/money/Money";

/**
 * T-902 — every figure comes straight from `GetAdminDashboardUseCase`, which reads the
 * ledger/markets/settlement_runs/risk_alerts tables fresh inside one transaction (no cache), so
 * this page can never disagree with `pnpm reconcile`. The layout above already gated this route
 * to ADMIN/AUDITOR sessions (T-901); this page fetches server-side, same as every other admin/
 * account page in this project (no client-side data fetching).
 */
export default async function AdminDashboardPage() {
  const container = getContainer();
  const dashboard = await container.getAdminDashboard.execute();

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Admin dashboard</h1>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-[var(--border-default)] p-4">
          <dt className="text-sm text-[var(--text-secondary)]">Open markets</dt>
          <dd className="text-2xl font-semibold text-[var(--text-primary)]">
            {dashboard.openMarketCount}
          </dd>
        </div>
        <div className="rounded border border-[var(--border-default)] p-4">
          <dt className="text-sm text-[var(--text-secondary)]">Total escrow at risk</dt>
          <dd className="text-2xl font-semibold text-[var(--text-primary)]">
            <Money amountMinor={dashboard.totalEscrowMinor} currency={container.config.CURRENCY} />
          </dd>
        </div>
        <div className="rounded border border-[var(--border-default)] p-4">
          <dt className="text-sm text-[var(--text-secondary)]">Pending settlement runs</dt>
          <dd className="text-2xl font-semibold text-[var(--text-primary)]">
            {dashboard.pendingSettlementRunCount}
          </dd>
        </div>
        <div className="rounded border border-[var(--border-default)] p-4">
          <dt className="text-sm text-[var(--text-secondary)]">Failed settlement runs</dt>
          <dd className="text-2xl font-semibold text-[var(--text-primary)]">
            {dashboard.failedSettlementRunCount}
          </dd>
        </div>
        <div className="rounded border border-[var(--border-default)] p-4">
          <dt className="text-sm text-[var(--text-secondary)]">Open risk alerts</dt>
          <dd className="text-2xl font-semibold text-[var(--text-primary)]">
            {dashboard.openRiskAlertCount}
          </dd>
        </div>
      </dl>
    </section>
  );
}
