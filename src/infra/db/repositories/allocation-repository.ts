import { alias } from "drizzle-orm/pg-core";
import { and, eq, or } from "drizzle-orm";
import type { AllocationRepository, MatchAllocation } from "@/domain/ports";
import { betOrders, matchAllocations } from "../schema/betting";
import type { DbTx } from "../uow";

/**
 * `match_allocations` has no `user_id` column, so ownership is resolved by joining through
 * `bet_orders` on both sides of the pair and filtering `WHERE bet_orders.user_id = ownerId`.
 */
export class DrizzleAllocationRepository implements AllocationRepository {
  constructor(
    private readonly tx: DbTx,
    private readonly ownerId: string,
  ) {}

  async findByOrderId(orderId: string): Promise<readonly MatchAllocation[]> {
    const orderA = alias(betOrders, "order_a");
    const orderB = alias(betOrders, "order_b");

    const rows = await this.tx
      .select({ allocation: matchAllocations })
      .from(matchAllocations)
      .innerJoin(orderA, eq(matchAllocations.orderAId, orderA.id))
      .innerJoin(orderB, eq(matchAllocations.orderBId, orderB.id))
      .where(
        and(
          or(eq(matchAllocations.orderAId, orderId), eq(matchAllocations.orderBId, orderId)),
          or(eq(orderA.userId, this.ownerId), eq(orderB.userId, this.ownerId)),
        ),
      );

    return rows.map(({ allocation }) => ({
      id: allocation.id,
      marketId: allocation.marketId,
      orderAId: allocation.orderAId,
      orderBId: allocation.orderBId,
      sequence: allocation.sequence,
      matchedMinor: allocation.matchedMinor,
      status: allocation.status,
      createdAt: allocation.createdAt,
      updatedAt: allocation.updatedAt,
    }));
  }
}
