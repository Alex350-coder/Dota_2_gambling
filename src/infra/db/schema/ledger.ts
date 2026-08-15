import { bigint, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const ledgerTransactionKind = pgEnum("ledger_transaction_kind", [
  "DEPOSIT",
  "RESERVE",
  "MATCH_ESCROW",
  "RELEASE",
  "SETTLE_PAYOUT",
  "SETTLE_COMMISSION",
  "VOID_REFUND",
  "WITHDRAWAL",
  "ADJUSTMENT",
  "FAUCET",
]);
export const ledgerActorType = pgEnum("ledger_actor_type", ["USER", "ADMIN", "SYSTEM"]);
export const ledgerReferenceType = pgEnum("ledger_reference_type", [
  "bet_order",
  "match_allocation",
  "market",
  "payment",
]);

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: ledgerTransactionKind("kind").notNull(),
    referenceType: ledgerReferenceType("reference_type").notNull(),
    referenceId: uuid("reference_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    actorType: ledgerActorType("actor_type").notNull(),
    actorId: uuid("actor_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ledger_transactions_reference").on(table.referenceType, table.referenceId),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id),
    accountKey: text("account_key").notNull(),
    currency: text("currency").notNull(),
    signedAmountMinor: bigint("signed_amount_minor", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ledger_entries_account_created").on(table.accountKey, table.createdAt),
    index("idx_ledger_entries_transaction_id").on(table.transactionId),
  ],
);
