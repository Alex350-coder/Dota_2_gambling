import type { BetOrder, BetOrderStatus } from "../betting/order";
import type { Repository } from "./repository";

export interface CreateBetOrderInput extends BetOrder {
  readonly betSlipId: string;
  readonly currency: string;
}

export interface ListOwnedBetOrdersFilter {
  readonly status?: BetOrderStatus | undefined;
  readonly marketId?: string | undefined;
}

/**
 * Owner-scoped at construction. `create()` takes the columns not yet part of the pure
 * `BetOrder` domain type (`betSlipId`, `currency`) since those are storage-shape concerns,
 * not matching/settlement invariants.
 */
export interface BetOrderRepository extends Repository<BetOrder, string> {
  create(input: CreateBetOrderInput): Promise<BetOrder>;
  /** All orders owned by the repository's owner, newest first, optionally filtered. */
  listByOwner(filter: ListOwnedBetOrdersFilter): Promise<BetOrder[]>;
}
