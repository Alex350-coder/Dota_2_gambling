import type { DbTx } from "@/infra/db";
import type { AdminDashboardReader, RiskAlertRepository, UnitOfWork } from "@/domain/ports";
import { GetAdminDashboardUseCase } from "@/application/admin";

/**
 * Admin-console-only use cases (T-901..T-916), split out of `container.ts` (RULE-C06's
 * per-file line cap) the same way `container-settlement.ts`/`container-identity.ts` already
 * split theirs off. Grows across the phase's commits as each admin surface (users, audit,
 * reconciliation, settlements retry) lands.
 */
export interface AdminContainerDeps {
  readonly uow: UnitOfWork<DbTx>;
  readonly dashboard: (tx: DbTx) => AdminDashboardReader;
  readonly riskAlerts: (tx: DbTx) => RiskAlertRepository;
}

export interface AdminUseCases<Tx> {
  readonly getAdminDashboard: GetAdminDashboardUseCase<Tx>;
}

export function buildAdminUseCases(deps: AdminContainerDeps): AdminUseCases<DbTx> {
  return {
    getAdminDashboard: new GetAdminDashboardUseCase<DbTx>(deps),
  };
}
