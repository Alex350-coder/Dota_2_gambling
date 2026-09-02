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

export interface AllocationCountsByStatus {
  readonly active: number;
  readonly settled: number;
  readonly voided: number;
}

/**
 * `findByOrderId` is scoped to a single owner at construction time. `match_allocations` has
 * no `user_id` column, so that read must join through `bet_orders` and filter
 * `WHERE bet_orders.user_id = $ownerId` at the SQL level. `create()` is a system-level write
 * performed by the matching engine and spans both counterparties, so it is intentionally not
 * owner-filtered — the append-only `match_allocations` trigger is the durable safety net.
 * `listActiveByMarketId`/`updateStatus`/`countByStatus` are likewise system-level, unfiltered
 * reads/writes used by settlement (SETTLEMENT.md §4), which must see every allocation on a
 * market regardless of which user owns either side of the pair.
 */
export interface AllocationRepository {
  findByOrderId(orderId: string): Promise<readonly MatchAllocation[]>;
  create(input: CreateMatchAllocationInput): Promise<MatchAllocation>;
  /**
   * Next monotonic `sequence` for a market's allocations. Callers must hold the market's
   * `pgAdvisoryXactLock` before calling this so concurrent matchers can't race on the same
   * value (RULE-B08 tie-break determinism extends to allocation ordering).
   */
  nextSequence(marketId: string): Promise<bigint>;
  /**
   * Every `ACTIVE` allocation for a market, ordered by `sequence` ascending
   * (SETTLEMENT.md §4's `ORDER BY a.id`, applied to the actual monotonic ordering column).
   * A resumed settlement run naturally skips everything already `SETTLED` since this only
   * ever returns the remainder.
   */
  listActiveByMarketId(marketId: string): Promise<readonly MatchAllocation[]>;
  /**
   * `UPDATE ... WHERE status = 'ACTIVE'` (SETTLEMENT.md §5): a second pass over an
   * already-settled allocation matches zero rows and this returns `null` rather than
   * throwing, so callers can treat it as a no-op instead of an error.
   */
  updateStatus(id: string, status: MatchAllocationStatus): Promise<MatchAllocation | null>;
  /** Progress snapshot for a settlement run (T-611 prep): counts by status for one market. */
  countByStatus(marketId: string): Promise<AllocationCountsByStatus>;
}
