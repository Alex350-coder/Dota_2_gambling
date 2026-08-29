import type { BetOrder } from "@/domain/betting";

/** Bigint minor-unit fields are always serialized via `.toString()` in JSON responses. */
export function serializeBetOrder(order: BetOrder) {
  return {
    id: order.id,
    marketId: order.marketId,
    outcomeId: order.outcomeId,
    requestedMinor: order.requestedMinor.toString(),
    matchedMinor: order.matchedMinor.toString(),
    unmatchedMinor: order.unmatchedMinor.toString(),
    releasedMinor: order.releasedMinor.toString(),
    oddsNum: order.oddsNum,
    oddsDen: order.oddsDen,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
