import {
  bigint,
  bigserial,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { markets, outcomes } from "./catalog";
import { users } from "./identity";

export const betOrderStatus = pgEnum("bet_order_status", [
  "PENDING",
  "OPEN",
  "MATCHED",
  "CANCELLED",
  "SETTLED",
  "VOIDED",
  "REJECTED",
]);

export const allocationStatus = pgEnum("allocation_status", ["ACTIVE", "SETTLED", "VOIDED"]);

export const betSlips = pgTable(
  "bet_slips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_bet_slips_user_id").on(table.userId)],
);

export const betOrders = pgTable(
  "bet_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    betSlipId: uuid("bet_slip_id")
      .notNull()
      .references(() => betSlips.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id),
    outcomeId: uuid("outcome_id")
      .notNull()
      .references(() => outcomes.id),
    currency: text("currency").notNull(),
    requestedMinor: bigint("requested_minor", { mode: "bigint" }).notNull(),
    matchedMinor: bigint("matched_minor", { mode: "bigint" }).notNull().default(0n),
    unmatchedMinor: bigint("unmatched_minor", { mode: "bigint" }).notNull().default(0n),
    releasedMinor: bigint("released_minor", { mode: "bigint" }).notNull().default(0n),
    oddsNum: integer("odds_num").notNull(),
    oddsDen: integer("odds_den").notNull(),
    commissionBps: integer("commission_bps").notNull(),
    status: betOrderStatus("status").notNull().default("PENDING"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    seq: bigserial("seq", { mode: "bigint" }).notNull(),
  },
  (table) => [
    unique("uq_bet_orders_idempotency").on(table.userId, table.idempotencyKey),
    index("idx_bet_orders_bet_slip_id").on(table.betSlipId),
    index("idx_bet_orders_user_id").on(table.userId),
  ],
);

export const matchAllocations = pgTable(
  "match_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id),
    orderAId: uuid("order_a_id")
      .notNull()
      .references(() => betOrders.id),
    orderBId: uuid("order_b_id")
      .notNull()
      .references(() => betOrders.id),
    sequence: bigint("sequence", { mode: "bigint" }).notNull(),
    matchedMinor: bigint("matched_minor", { mode: "bigint" }).notNull(),
    status: allocationStatus("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_ma_order_pair_sequence").on(table.orderAId, table.orderBId, table.sequence),
    index("idx_match_allocations_market_id").on(table.marketId),
    index("idx_match_allocations_order_a_id").on(table.orderAId),
    index("idx_match_allocations_order_b_id").on(table.orderBId),
  ],
);
