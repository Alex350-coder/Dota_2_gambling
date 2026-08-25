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

export interface CreateMatchAllocationInput {
  readonly id: string;
  readonly marketId: string;
  readonly orderAId: string;
  readonly orderBId: string;
  readonly sequence: bigint;
  readonly matchedMinor: bigint;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * `findByOrderId` is scoped to a single owner at construction time. `match_allocations` has
 * no `user_id` column, so that read must join through `bet_orders` and filter
 * `WHERE bet_orders.user_id = $ownerId` at the SQL level. `create()` is a system-level write
 * performed by the matching engine and spans both counterparties, so it is intentionally not
 * owner-filtered — the append-only `match_allocations` trigger is the durable safety net.
 */
export interface AllocationRepository {
  findByOrderId(orderId: string): Promise<readonly MatchAllocation[]>;
  create(input: CreateMatchAllocationInput): Promise<MatchAllocation>;
}
