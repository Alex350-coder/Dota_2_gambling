import { bigint, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

export const wallets = pgTable(
  "wallets",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    currency: text("currency").notNull(),
    availableMinor: bigint("available_minor", { mode: "bigint" }).notNull().default(0n),
    lockedMinor: bigint("locked_minor", { mode: "bigint" }).notNull().default(0n),
    version: bigint("version", { mode: "bigint" }).notNull().default(0n),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.currency] })],
);
