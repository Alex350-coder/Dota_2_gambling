import type { DbTx } from "@/infra/db";
import type {
  AdminDashboardReader,
  AuditEventRepository,
  RiskAlertRepository,
  SystemHealthReader,
  UnitOfWork,
} from "@/domain/ports";
import {
  GetAdminDashboardUseCase,
  SearchAuditEventsUseCase,
  GetSystemHealthUseCase,
} from "@/application/admin";

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
  readonly auditEvents: (tx: DbTx) => AuditEventRepository;
  readonly systemHealth: (tx: DbTx) => SystemHealthReader;
}

export interface AdminUseCases<Tx> {
  readonly getAdminDashboard: GetAdminDashboardUseCase<Tx>;
  readonly searchAuditEvents: SearchAuditEventsUseCase<Tx>;
  readonly getSystemHealth: GetSystemHealthUseCase<Tx>;
}

export function buildAdminUseCases(deps: AdminContainerDeps): AdminUseCases<DbTx> {
  return {
    getAdminDashboard: new GetAdminDashboardUseCase<DbTx>(deps),
    searchAuditEvents: new SearchAuditEventsUseCase<DbTx>(deps),
    getSystemHealth: new GetSystemHealthUseCase<DbTx>(deps),
  };
}
