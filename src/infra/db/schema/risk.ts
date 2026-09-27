import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

export const riskAlertSeverity = pgEnum("risk_alert_severity", ["MEDIUM", "HIGH", "CRITICAL"]);
export const riskAlertStatus = pgEnum("risk_alert_status", [
  "OPEN",
  "UNDER_REVIEW",
  "CONFIRMED_ABUSE",
  "FALSE_POSITIVE",
  "INCONCLUSIVE",
  "CLOSED",
]);

/**
 * `risk_alerts` (compliance/FRAUD_PREVENTION.md §3/§4, T-913) — one row per deterministic-rule
 * hit (R-03..R-12). Mutable (status/review columns advance through the OPEN -> ... -> CLOSED
 * lifecycle), unlike the append-only ledger/audit_events tables.
 */
export const riskAlerts = pgTable(
  "risk_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: text("rule_id").notNull(),
    severity: riskAlertSeverity("severity").notNull(),
    entityType: text("entity_type").notNull(),
    // text, not uuid: reconciliation-triggered alerts (R-11/R-12) key off an invariant id like
    // "INV-03", not a uuid — see db/migrations/0021_risk_alerts.sql.
    entityId: text("entity_id").notNull(),
    payload: jsonb("payload").notNull(),
    status: riskAlertStatus("status").notNull().default("OPEN"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_risk_alerts_rule").on(table.ruleId, table.createdAt),
    index("idx_risk_alerts_status").on(table.status),
    index("idx_risk_alerts_entity").on(table.entityType, table.entityId),
  ],
);
