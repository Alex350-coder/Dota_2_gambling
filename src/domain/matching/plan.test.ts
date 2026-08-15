import { describe, expect, it } from "vitest";
import { toMinor } from "../money/types";
import { planFifoAllocations, type RestingOrder } from "./plan";

const ODDS = { num: 18, den: 10 };

function resting(overrides: Partial<RestingOrder> = {}): RestingOrder {
  return {
    orderId: "resting-1",
    unmatchedMinor: toMinor(5_000n),
    oddsNum: ODDS.num,
    oddsDen: ODDS.den,
    ...overrides,
  };
}

describe("planFifoAllocations", () => {
  it("fully matches an incoming order against a single resting order of equal size", () => {
    const result = planFifoAllocations({
      marketId: "market-1",
      incomingOrderId: "incoming-1",
      incomingUnmatchedMinor: toMinor(5_000n),
      incomingOddsNum: ODDS.num,
      incomingOddsDen: ODDS.den,
      commissionBps: 2_000,
      restingOrders: [resting()],
    });

    expect(result.allocations).toEqual([
      {
        marketId: "market-1",
        orderAId: "incoming-1",
        orderBId: "resting-1",
        amountMinor: 5_000n,
        oddsNum: 18,
        oddsDen: 10,
        commissionBps: 2_000,
      },
    ]);
    expect(result.incomingRemainingMinor).toBe(0n);
    expect(result.restingRemaining).toEqual([{ orderId: "resting-1", unmatchedMinor: 0n }]);
  });

  it("partially matches against the first resting order and leaves incoming unmatched", () => {
    const result = planFifoAllocations({
      marketId: "market-1",
      incomingOrderId: "incoming-1",
      incomingUnmatchedMinor: toMinor(10_000n),
      incomingOddsNum: ODDS.num,
      incomingOddsDen: ODDS.den,
      commissionBps: 2_000,
      restingOrders: [resting({ unmatchedMinor: toMinor(3_000n) })],
    });

    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]?.amountMinor).toBe(3_000n);
    expect(result.incomingRemainingMinor).toBe(7_000n);
    expect(result.restingRemaining).toEqual([{ orderId: "resting-1", unmatchedMinor: 0n }]);
  });

  it("walks the FIFO queue across multiple resting orders in order", () => {
    const result = planFifoAllocations({
      marketId: "market-1",
      incomingOrderId: "incoming-1",
      incomingUnmatchedMinor: toMinor(8_000n),
      incomingOddsNum: ODDS.num,
      incomingOddsDen: ODDS.den,
      commissionBps: 2_000,
      restingOrders: [
        resting({ orderId: "resting-1", unmatchedMinor: toMinor(3_000n) }),
        resting({ orderId: "resting-2", unmatchedMinor: toMinor(4_000n) }),
        resting({ orderId: "resting-3", unmatchedMinor: toMinor(5_000n) }),
      ],
    });

    expect(result.allocations.map((a) => [a.orderBId, a.amountMinor])).toEqual([
      ["resting-1", 3_000n],
      ["resting-2", 4_000n],
      ["resting-3", 1_000n],
    ]);
    expect(result.incomingRemainingMinor).toBe(0n);
    expect(result.restingRemaining).toEqual([
      { orderId: "resting-1", unmatchedMinor: 0n },
      { orderId: "resting-2", unmatchedMinor: 0n },
      { orderId: "resting-3", unmatchedMinor: 4_000n },
    ]);
  });

  it("stops walking the queue once the incoming order is fully matched", () => {
    const result = planFifoAllocations({
      marketId: "market-1",
      incomingOrderId: "incoming-1",
      incomingUnmatchedMinor: toMinor(3_000n),
      incomingOddsNum: ODDS.num,
      incomingOddsDen: ODDS.den,
      commissionBps: 2_000,
      restingOrders: [
        resting({ orderId: "resting-1", unmatchedMinor: toMinor(3_000n) }),
        resting({ orderId: "resting-2", unmatchedMinor: toMinor(4_000n) }),
      ],
    });

    expect(result.allocations).toHaveLength(1);
    expect(result.restingRemaining).toEqual([
      { orderId: "resting-1", unmatchedMinor: 0n },
      { orderId: "resting-2", unmatchedMinor: 4_000n },
    ]);
  });

  it("skips a resting order with zero unmatched without producing an allocation", () => {
    const result = planFifoAllocations({
      marketId: "market-1",
      incomingOrderId: "incoming-1",
      incomingUnmatchedMinor: toMinor(5_000n),
      incomingOddsNum: ODDS.num,
      incomingOddsDen: ODDS.den,
      commissionBps: 2_000,
      restingOrders: [
        resting({ orderId: "resting-1", unmatchedMinor: toMinor(0n) }),
        resting({ orderId: "resting-2", unmatchedMinor: toMinor(5_000n) }),
      ],
    });

    expect(result.allocations.map((a) => [a.orderBId, a.amountMinor])).toEqual([
      ["resting-2", 5_000n],
    ]);
    expect(result.restingRemaining).toEqual([
      { orderId: "resting-1", unmatchedMinor: 0n },
      { orderId: "resting-2", unmatchedMinor: 0n },
    ]);
  });

  it("produces no allocations when there are no resting orders", () => {
    const result = planFifoAllocations({
      marketId: "market-1",
      incomingOrderId: "incoming-1",
      incomingUnmatchedMinor: toMinor(3_000n),
      incomingOddsNum: ODDS.num,
      incomingOddsDen: ODDS.den,
      commissionBps: 2_000,
      restingOrders: [],
    });

    expect(result.allocations).toEqual([]);
    expect(result.incomingRemainingMinor).toBe(3_000n);
    expect(result.restingRemaining).toEqual([]);
  });

  it("rejects a pairing that violates the self-funding constraint", () => {
    expect(() => {
      planFifoAllocations({
        marketId: "market-1",
        incomingOrderId: "incoming-1",
        incomingUnmatchedMinor: toMinor(5_000n),
        incomingOddsNum: 21,
        incomingOddsDen: 10,
        commissionBps: 2_000,
        restingOrders: [resting()],
      });
    }).toThrow(expect.objectContaining({ code: "UNSUPPORTED_MARKET_MODEL" }));
  });
});
