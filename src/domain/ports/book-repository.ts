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
  /**
   * Every still-`OPEN` order on a market with a nonzero unmatched remainder, across all
   * outcomes and users — feeds the batch release run on market close (T-511). `FOR UPDATE`
   * for the same reason as `findRestingOrders`: the caller mutates every row it reads.
   */
  findOpenOrdersByMarket(marketId: string): Promise<readonly BetOrder[]>;
  /**
   * Every order on a market, any status, across all outcomes and users — settlement's only
   * way to resolve which side of a `match_allocations` pair won (each side references a
   * `bet_orders.id`, not a user directly) and, later, to finalise every remaining order's
   * terminal status (T-609). `FOR UPDATE` since settlement mutates orders in the same pass.
   */
  findAllByMarketId(marketId: string): Promise<readonly BetOrder[]>;
}
