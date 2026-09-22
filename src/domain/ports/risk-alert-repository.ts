export type RiskAlertSeverity = "MEDIUM" | "HIGH" | "CRITICAL";
export type RiskAlertStatus =
  "OPEN" | "UNDER_REVIEW" | "CONFIRMED_ABUSE" | "FALSE_POSITIVE" | "INCONCLUSIVE" | "CLOSED";

export interface RiskAlertRecord {
  readonly id: string;
  readonly ruleId: string;
  readonly severity: RiskAlertSeverity;
  readonly entityType: string;
  readonly entityId: string;
  readonly payload: Record<string, unknown>;
  readonly status: RiskAlertStatus;
  readonly reviewedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly reviewNote: string | null;
  readonly createdAt: Date;
}

export interface CreateRiskAlertInput {
  readonly id: string;
  readonly ruleId: string;
  readonly severity: RiskAlertSeverity;
  readonly entityType: string;
  readonly entityId: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface RiskAlertFilter {
  readonly ruleId?: string;
  readonly status?: RiskAlertStatus;
  readonly entityType?: string;
  readonly entityId?: string;
}

/**
 * `risk_alerts` (compliance/FRAUD_PREVENTION.md §3, T-913) — global/admin-scoped, no ownership
 * filter, mirroring `SettlementRunRepository`/`MarketResultRepository`. One row per rule hit;
 * mutable status/review fields advance through the §4 lifecycle.
 */
export interface RiskAlertRepository {
  create(input: CreateRiskAlertInput): Promise<RiskAlertRecord>;
  findById(id: string): Promise<RiskAlertRecord | null>;
  list(filter?: RiskAlertFilter): Promise<RiskAlertRecord[]>;
  countOpen(): Promise<number>;
}
