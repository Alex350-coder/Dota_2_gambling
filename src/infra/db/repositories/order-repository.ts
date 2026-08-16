import { and, eq } from "drizzle-orm";
import type { BetOrder } from "@/domain/betting";
import type { BetOrderRepository } from "@/domain/ports";
import { DomainError } from "@/domain/errors";
import { toMinor } from "@/domain/money";
import { betOrders } from "../schema/betting";
import type { DbTx } from "../uow";

/**
 * Owner-scoped at construction. Order *creation* (with its `bet_slip_id`/`currency` columns,
 * not yet part of the P1 `BetOrder` domain type) lands in P5's placement flow — `save()` here
 * only updates the mutable fields of an existing row, always re-filtered by `user_id`.
 */
export class DrizzleOrderRepository implements BetOrderRepository {
  constructor(
    private readonly tx: DbTx,
    private readonly ownerId: string,
  ) {}

  async findById(id: string): Promise<BetOrder | null> {
    const [row] = await this.tx
      .select()
      .from(betOrders)
      .where(and(eq(betOrders.id, id), eq(betOrders.userId, this.ownerId)));

    if (!row) {
      return null;
    }

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

  async save(entity: BetOrder): Promise<void> {
    if (entity.userId !== this.ownerId) {
      throw new DomainError(
        "UNAUTHORIZED_OPERATION",
        "cannot save a bet order owned by a different user",
        { details: { orderId: entity.id, ownerId: this.ownerId, entityUserId: entity.userId } },
      );
    }

    const updated = await this.tx
      .update(betOrders)
      .set({
        matchedMinor: entity.matchedMinor,
        unmatchedMinor: entity.unmatchedMinor,
        releasedMinor: entity.releasedMinor,
        status: entity.status,
        updatedAt: entity.updatedAt,
      })
      .where(and(eq(betOrders.id, entity.id), eq(betOrders.userId, this.ownerId)))
      .returning({ id: betOrders.id });

    if (updated.length === 0) {
      throw new DomainError("RESOURCE_NOT_FOUND", "bet order not found for this owner", {
        details: { orderId: entity.id, ownerId: this.ownerId },
      });
    }
  }
}
