import { describe, expect, it } from "vitest";
import { toMinor } from "../money/types";
import { createBetOrder } from "./order";

const FIXED_DATE = new Date("2026-01-01T00:00:00.000Z");

function baseInput() {
  return {
    id: "order-1",
    userId: "user-1",
    marketId: "market-1",
    outcomeId: "outcome-1",
    requestedMinor: toMinor(10_000n),
    matchedMinor: toMinor(3_000n),
    unmatchedMinor: toMinor(7_000n),
    releasedMinor: toMinor(0n),
    oddsNum: 18,
    oddsDen: 10,
    commissionBps: 2_000,
    status: "OPEN" as const,
    idempotencyKey: "idem-1",
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };
}

describe("createBetOrder", () => {
  it("builds a valid BetOrder when the accounting invariants hold", () => {
    const order = createBetOrder(baseInput());

    expect(order.status).toBe("OPEN");
    expect(order.matchedMinor).toBe(3_000n);
  });

  it("accepts a fully unmatched PENDING order", () => {
    const order = createBetOrder({
      ...baseInput(),
      status: "PENDING",
      matchedMinor: toMinor(0n),
      unmatchedMinor: toMinor(10_000n),
      releasedMinor: toMinor(0n),
    });

    expect(order.unmatchedMinor).toBe(10_000n);
  });

  it("throws when matchedMinor exceeds requestedMinor (RULE-B01)", () => {
    expect(() => {
      createBetOrder({
        ...baseInput(),
        requestedMinor: toMinor(100n),
        matchedMinor: toMinor(200n),
        unmatchedMinor: toMinor(0n),
        releasedMinor: toMinor(0n),
      });
    }).toThrow(/matchedMinor/);
  });

  it("throws when matched+unmatched+released does not equal requested (RULE-B02)", () => {
    expect(() => {
      createBetOrder({
        ...baseInput(),
        requestedMinor: toMinor(10_000n),
        matchedMinor: toMinor(3_000n),
        unmatchedMinor: toMinor(3_000n),
        releasedMinor: toMinor(0n),
      });
    }).toThrow(/requestedMinor/);
  });

  it("throws for a non-positive odds numerator", () => {
    expect(() => {
      createBetOrder({ ...baseInput(), oddsNum: 0 });
    }).toThrow(RangeError);
  });

  it("throws for a non-positive odds denominator", () => {
    expect(() => {
      createBetOrder({ ...baseInput(), oddsDen: 0 });
    }).toThrow(RangeError);
  });

  it("throws for an out-of-range commission bps", () => {
    expect(() => {
      createBetOrder({ ...baseInput(), commissionBps: 10_001 });
    }).toThrow(RangeError);
  });

  it("carries the DomainError code VALIDATION_FAILED for invariant violations", () => {
    expect(() => {
      createBetOrder({
        ...baseInput(),
        requestedMinor: toMinor(100n),
        matchedMinor: toMinor(200n),
        unmatchedMinor: toMinor(0n),
        releasedMinor: toMinor(0n),
      });
    }).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });
});
