import type { MatchAllocationStatus } from "../settlement/state";

export interface MatchAllocation {
  readonly id: string;
  readonly marketId: string;
  readonly orderAId: string;
  readonly orderBId: string;
  readonly sequence: bigint;
  readonly matchedMinor: bigint;
  readonly status: MatchAllocationStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Scoped to a single owner at construction time. `match_allocations` has no `user_id`
 * column, so every implementation must join through `bet_orders` and filter
 * `WHERE bet_orders.user_id = $ownerId` at the SQL level.
 */
export interface AllocationRepository {
  findByOrderId(orderId: string): Promise<readonly MatchAllocation[]>;
}
