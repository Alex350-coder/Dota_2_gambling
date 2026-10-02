import { and, asc, eq, gt, ne } from "drizzle-orm";
import type { BetOrder } from "@/domain/betting";
import type { BookRepository } from "@/domain/ports";
import { toMinor } from "@/domain/money";
import { betOrders } from "../schema/betting";
import type { DbTx } from "../uow";

/**
 * Cross-user FIFO scan: opposing-outcome, other-user, still-unmatched, `OPEN` orders on one
 * market, ordered `(created_at ASC, seq ASC)` — `seq` is a DB-generated monotonic sequence
 * (0018_bet_orders_seq.sql) used as the tie-break because `created_at` is app-clock, millisecond
 * resolution and can collide; `seq` always reflects true insertion order (RULE-B08). Backed by
 * the partial `book_idx` index. `FOR UPDATE` locks every returned row so the matching engine can
 * safely mutate them within the same transaction.
 */
export class DrizzleBookRepository implements BookRepository {
  constructor(private readonly tx: DbTx) {}

  async findRestingOrders(
    marketId: string,
    outcomeId: string,
    excludeUserId: string,
  ): Promise<readonly BetOrder[]> {
    const rows = await this.tx
      .select()
      .from(betOrders)
      .where(
        and(
          eq(betOrders.marketId, marketId),
          ne(betOrders.outcomeId, outcomeId),
          ne(betOrders.userId, excludeUserId),
          gt(betOrders.unmatchedMinor, 0n),
          eq(betOrders.status, "OPEN"),
        ),
      )
      .orderBy(asc(betOrders.createdAt), asc(betOrders.seq))
      .for("update");

    return rows.map((row) => this.toBetOrder(row));
  }

  async findOpenOrdersByMarket(marketId: string): Promise<readonly BetOrder[]> {
    const rows = await this.tx
      .select()
      .from(betOrders)
      .where(
        and(
          eq(betOrders.marketId, marketId),
          gt(betOrders.unmatchedMinor, 0n),
          eq(betOrders.status, "OPEN"),
        ),
      )
      .orderBy(asc(betOrders.createdAt), asc(betOrders.seq))
      .for("update");

    return rows.map((row) => this.toBetOrder(row));
  }

  async findAllByMarketId(marketId: string): Promise<readonly BetOrder[]> {
    const rows = await this.tx
      .select()
      .from(betOrders)
      .where(eq(betOrders.marketId, marketId))
      .orderBy(asc(betOrders.createdAt), asc(betOrders.seq))
      .for("update");

    return rows.map((row) => this.toBetOrder(row));
  }

  private toBetOrder(row: typeof betOrders.$inferSelect): BetOrder {
    return {
      id: row.id,
      userId: row.userId,
      marketId: row.marketId,
      outcomeId: row.outcomeId,
      requestedMinor: toMinor(row.requestedMinor),
      matchedMinor: toMinor(row.matchedMinor),
      unmatchedMinor: toMinor(row.unmatchedMinor),
      releasedMinor: toMinor(row.releasedMinor),
      oddsNum: row.oddsNum,
      oddsDen: row.oddsDen,
      commissionBps: row.commissionBps,
      status: row.status,
      idempotencyKey: row.idempotencyKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
