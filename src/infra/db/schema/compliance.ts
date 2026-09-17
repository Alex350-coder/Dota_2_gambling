import { bigint, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

export const rgLimitKind = pgEnum("rg_limit_kind", [
  "DEPOSIT",
  "STAKE",
  "LOSS",
  "SESSION_TIME",
  "SINGLE_BET",
]);
export const rgLimitPeriod = pgEnum("rg_limit_period", [
  "DAY",
  "WEEK",
  "MONTH",
  "SESSION",
  "PER_BET",
]);

export const rgLimits = pgTable(
  "rg_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: rgLimitKind("kind").notNull(),
    period: rgLimitPeriod("period").notNull(),
    currentValue: bigint("current_value", { mode: "bigint" }).notNull(),
    pendingValue: bigint("pending_value", { mode: "bigint" }),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.kind, table.period)],
);

/**
 * Append-only history of self-exclusion periods (trg_self_exclusions_immutable,
 * 0020_compliance_limits.sql) — `users.revocableAt`/`status` carry the currently
 * enforced state; this table is the audit trail of every period a user has chosen.
 */
export const selfExclusions = pgTable("self_exclusions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  period: text("period").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  revocableAt: timestamp("revocable_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
