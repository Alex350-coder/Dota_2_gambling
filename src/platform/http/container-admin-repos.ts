import {
  DrizzleAdminDashboardReader,
  DrizzleAuditEventRepository,
  DrizzleRiskAlertRepository,
  DrizzleRiskSignalReader,
  DrizzleSystemHealthReader,
  type DbTx,
} from "@/infra/db";

export interface AdminRepoFactories {
  readonly dashboard: (tx: DbTx) => DrizzleAdminDashboardReader;
  readonly auditEvents: (tx: DbTx) => DrizzleAuditEventRepository;
  readonly systemHealth: (tx: DbTx) => DrizzleSystemHealthReader;
  readonly riskAlerts: (tx: DbTx) => DrizzleRiskAlertRepository;
  readonly riskSignals: (tx: DbTx) => DrizzleRiskSignalReader;
}

/**
 * Read-model repository factories for the admin console (T-902/T-907/T-909/T-913/T-914) — split
 * out of `container.ts` purely to keep that file under the repo's `max-lines` cap, the same
 * rationale as `container-settlement.ts`/`container-identity.ts`, not a new architectural layer.
 * Each is a plain `(tx) => new DrizzleX(tx)` wrapper with no cross-dependencies, so this needs no
 * input deps of its own.
 */
export function buildAdminRepoFactories(): AdminRepoFactories {
  return {
    dashboard: (tx: DbTx) => new DrizzleAdminDashboardReader(tx),
    auditEvents: (tx: DbTx) => new DrizzleAuditEventRepository(tx),
    systemHealth: (tx: DbTx) => new DrizzleSystemHealthReader(tx),
    riskAlerts: (tx: DbTx) => new DrizzleRiskAlertRepository(tx),
    riskSignals: (tx: DbTx) => new DrizzleRiskSignalReader(tx),
  };
}
