import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { markets, outcomes } from "./catalog";
import { users } from "./identity";

export const resultStatus = pgEnum("result_status", [
  "PENDING",
  "PROPOSED",
  "CONFIRMED",
  "DISPUTED",
  "SUPERSEDED",
  "VOID_PROPOSED",
]);

export const resultTrustLevel = pgEnum("result_trust_level", [
  "UNVERIFIED",
  "SINGLE_SOURCE",
  "CORROBORATED",
  "OFFICIAL",
]);

export const marketResults = pgTable(
  "market_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id),
    providerKey: text("provider_key").notNull(),
    trustLevel: resultTrustLevel("trust_level").notNull(),
    winningOutcomeId: uuid("winning_outcome_id").references(() => outcomes.id),
    rawPayload: jsonb("raw_payload").notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: resultStatus("status").notNull().default("PENDING"),
    proposedBy: uuid("proposed_by").references(() => users.id),
    confirmedBy: uuid("confirmed_by").references(() => users.id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- self-referencing FK requires AnyPgColumn typing
    supersedesId: uuid("supersedes_id").references((): any => marketResults.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_market_results_market_id").on(table.marketId),
    uniqueIndex("one_confirmed_result_per_market")
      .on(table.marketId)
      .where(sql`status = 'CONFIRMED'`),
  ],
);

export const settlementRunStatus = pgEnum("settlement_run_status", [
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
]);

export const settlementRuns = pgTable(
  "settlement_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id),
    resultId: uuid("result_id")
      .notNull()
      .references(() => marketResults.id),
    status: settlementRunStatus("status").notNull().default("IN_PROGRESS"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    allocationsTotal: integer("allocations_total").notNull().default(0),
    allocationsSettled: integer("allocations_settled").notNull().default(0),
    payoutTotalMinor: bigint("payout_total_minor", { mode: "bigint" }).notNull().default(0n),
    commissionTotalMinor: bigint("commission_total_minor", { mode: "bigint" })
      .notNull()
      .default(0n),
    refundTotalMinor: bigint("refund_total_minor", { mode: "bigint" }).notNull().default(0n),
  },
  (table) => [
    index("idx_settlement_runs_market_id").on(table.marketId),
    uniqueIndex("one_completed_run_per_market")
      .on(table.marketId)
      .where(sql`status = 'COMPLETED'`),
  ],
);
