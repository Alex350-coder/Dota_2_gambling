import { and, count, eq, inArray, like, sql } from "drizzle-orm";
import type { AdminDashboardReader, AdminDashboardSummary } from "@/domain/ports";
import { markets } from "./schema/catalog";
import { settlementRuns } from "./schema/settlement";
import { ledgerEntries } from "./schema/ledger";
import type { DbTx } from "./uow";

/**
 * Escrow is never zero once a market has any resting/matched liquidity, and only reaches zero
 * again at SETTLED/VOID (`reconcile-queries.ts` INV-07) — so "total escrow still at risk" sums
 * `MARKET_ESCROW:%` ledger entries for every market not yet in one of those two terminal states,
 * mirroring INV-06/INV-13's SQL shape rather than reimplementing it from scratch.
 */
const ESCROW_LIVE_MARKET_STATUSES = [
  "DRAFT",
  "OPEN",
  "SUSPENDED",
  "CLOSED",
  "SETTLING",
  "CANCELLED",
] as const;

export class DrizzleAdminDashboardReader implements AdminDashboardReader {
  constructor(private readonly tx: DbTx) {}

  async getSummary(): Promise<AdminDashboardSummary> {
    const [openMarketRow] = await this.tx
      .select({ value: count() })
      .from(markets)
      .where(eq(markets.status, "OPEN"));

    const [escrowRow] = await this.tx
      .select({ total: sql<string | null>`sum(${ledgerEntries.signedAmountMinor})` })
      .from(ledgerEntries)
      .innerJoin(
        markets,
        sql`${markets.id} = SUBSTRING(${ledgerEntries.accountKey} FROM '^MARKET_ESCROW:(.*)$')::uuid`,
      )
      .where(
        and(
          like(ledgerEntries.accountKey, "MARKET_ESCROW:%"),
          inArray(markets.status, ESCROW_LIVE_MARKET_STATUSES),
        ),
      );

    const [pendingRow] = await this.tx
      .select({ value: count() })
      .from(settlementRuns)
      .where(eq(settlementRuns.status, "IN_PROGRESS"));

    const [failedRow] = await this.tx
      .select({ value: count() })
      .from(settlementRuns)
      .where(eq(settlementRuns.status, "FAILED"));

    return {
      openMarketCount: openMarketRow?.value ?? 0,
      totalEscrowMinor:
        escrowRow?.total === null || escrowRow?.total === undefined ? 0n : BigInt(escrowRow.total),
      pendingSettlementRunCount: pendingRow?.value ?? 0,
      failedSettlementRunCount: failedRow?.value ?? 0,
    };
  }
}
