import { assertSelfFunding } from "../betting/self-funding";
import { sub } from "../money/arith";
import { toMinor, type Minor } from "../money/types";

/** A resting order's live position in the book (FIFO order = array order). */
export interface RestingOrder {
  readonly orderId: string;
  readonly unmatchedMinor: Minor;
  readonly oddsNum: number;
  readonly oddsDen: number;
}

export interface RestingOrderRemainder {
  readonly orderId: string;
  readonly unmatchedMinor: Minor;
}

/** A proposed pairing between the incoming order and one resting order. See BETTING_ENGINE.md §4. */
export interface ProposedAllocation {
  readonly marketId: string;
  readonly orderAId: string;
  readonly orderBId: string;
  readonly amountMinor: Minor;
  readonly oddsNum: number;
  readonly oddsDen: number;
  readonly commissionBps: number;
}

export interface FifoMatchInput {
  readonly marketId: string;
  readonly incomingOrderId: string;
  readonly incomingUnmatchedMinor: Minor;
  readonly incomingOddsNum: number;
  readonly incomingOddsDen: number;
  readonly commissionBps: number;
  readonly restingOrders: readonly RestingOrder[];
}

export interface FifoMatchResult {
  readonly allocations: readonly ProposedAllocation[];
  readonly incomingRemainingMinor: Minor;
  readonly restingRemaining: readonly RestingOrderRemainder[];
}

function minMinor(a: Minor, b: Minor): Minor {
  return toMinor(a < b ? a : b);
}

/**
 * Pure FIFO partial-allocation planner: walks `restingOrders` in array order,
 * pairing each against the incoming order for min(unmatched, unmatched) until
 * either side is exhausted. No I/O, no ids, no timestamps — the caller turns
 * each `ProposedAllocation` into a persisted `MatchAllocation`.
 */
export function planFifoAllocations(input: FifoMatchInput): FifoMatchResult {
  const allocations: ProposedAllocation[] = [];
  const restingRemaining: RestingOrderRemainder[] = [];

  let incomingRemaining = input.incomingUnmatchedMinor;

  for (const order of input.restingOrders) {
    if (incomingRemaining === 0n) {
      restingRemaining.push({ orderId: order.orderId, unmatchedMinor: order.unmatchedMinor });
      continue;
    }

    const amount = minMinor(incomingRemaining, order.unmatchedMinor);

    if (amount > 0n) {
      assertSelfFunding(
        amount,
        { num: input.incomingOddsNum, den: input.incomingOddsDen },
        amount,
        { num: order.oddsNum, den: order.oddsDen },
      );

      allocations.push({
        marketId: input.marketId,
        orderAId: input.incomingOrderId,
        orderBId: order.orderId,
        amountMinor: amount,
        oddsNum: input.incomingOddsNum,
        oddsDen: input.incomingOddsDen,
        commissionBps: input.commissionBps,
      });

      incomingRemaining = toMinor(sub(incomingRemaining, amount));
    }

    restingRemaining.push({
      orderId: order.orderId,
      unmatchedMinor: toMinor(sub(order.unmatchedMinor, amount)),
    });
  }

  return {
    allocations,
    incomingRemainingMinor: incomingRemaining,
    restingRemaining,
  };
}
