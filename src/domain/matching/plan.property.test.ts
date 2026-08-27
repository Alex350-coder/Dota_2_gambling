import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { planFifoAllocations, type RestingOrder } from "./plan";
import { toMinor } from "../money/types";

const restingOrderArb: fc.Arbitrary<RestingOrder> = fc.record({
  orderId: fc.uuid(),
  unmatchedMinor: fc.bigInt({ min: 1n, max: 1_000_000n }).map((n) => toMinor(n)),
  oddsNum: fc.constant(18),
  oddsDen: fc.constant(10),
});

/**
 * PROP-02 (`Claude/Testing.md`): for any random incoming stake and any random sequence of
 * resting counterparties (same odds so `assertSelfFunding` never rejects a pairing),
 * `sum(allocations) = matched <= requested` must hold — the planner never fabricates or
 * loses money regardless of how the book is shaped.
 */
describe("planFifoAllocations property (PROP-02)", () => {
  it("never allocates more than requested and never overmatches a resting order", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 1_000_000n }).map((n) => toMinor(n)),
        fc.array(restingOrderArb, { minLength: 0, maxLength: 20 }),
        (incomingUnmatchedMinor, restingOrders) => {
          const result = planFifoAllocations({
            marketId: "11111111-1111-1111-1111-111111111111",
            incomingOrderId: "22222222-2222-2222-2222-222222222222",
            incomingUnmatchedMinor,
            incomingOddsNum: 18,
            incomingOddsDen: 10,
            commissionBps: 2000,
            restingOrders,
          });

          const matched = result.allocations.reduce((sum, a) => sum + a.amountMinor, 0n);
          const sumAllocated = result.allocations.reduce((sum, a) => sum + a.amountMinor, 0n);

          expect(sumAllocated).toBe(matched);
          expect(matched).toBeLessThanOrEqual(incomingUnmatchedMinor);
          expect(matched + result.incomingRemainingMinor).toBe(incomingUnmatchedMinor);

          const restingById = new Map(restingOrders.map((order) => [order.orderId, order]));
          const allocatedPerResting = new Map<string, bigint>();
          for (const allocation of result.allocations) {
            allocatedPerResting.set(
              allocation.orderBId,
              (allocatedPerResting.get(allocation.orderBId) ?? 0n) + allocation.amountMinor,
            );
          }
          for (const [orderId, allocated] of allocatedPerResting) {
            const original = restingById.get(orderId);
            if (!original) throw new Error("allocation referenced an unknown resting order");
            expect(allocated).toBeLessThanOrEqual(original.unmatchedMinor);
          }

          for (const remainder of result.restingRemaining) {
            const original = restingById.get(remainder.orderId);
            if (!original) throw new Error("remainder referenced an unknown resting order");
            expect(remainder.unmatchedMinor).toBeGreaterThanOrEqual(0n);
            expect(remainder.unmatchedMinor).toBeLessThanOrEqual(original.unmatchedMinor);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
