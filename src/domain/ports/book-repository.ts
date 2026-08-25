import type { BetOrder } from "../betting/order";

/**
 * Cross-user FIFO scan of the resting book for one market/outcome pair — a different read
 * shape than the owner-scoped `BetOrderRepository`, since matching must see every other
 * user's open orders. `findRestingOrders` locks every returned row `FOR UPDATE` so the
 * matching engine can safely mutate them within the same transaction.
 */
export interface BookRepository {
  findRestingOrders(
    marketId: string,
    outcomeId: string,
    excludeUserId: string,
  ): Promise<readonly BetOrder[]>;
}
