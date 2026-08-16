import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { add, scaleByRatio } from "../money/arith";
import { STREAMER_COMMISSION_BPS } from "../money/bps";
import { toMinor } from "../money/types";
import { calculatePayout } from "./payout";

describe("calculatePayout", () => {
  it("computes commission as floor(m * commission_bps / 10_000)", () => {
    const { commissionMinor } = calculatePayout(toMinor(1_000n));

    // 1000 * 2000 / 10000 = 200
    expect(commissionMinor).toBe(200n);
  });

  it("computes winner_return as 2m - commission", () => {
    const { winnerReturnMinor } = calculatePayout(toMinor(1_000n));

    // 2*1000 - 200 = 1800
    expect(winnerReturnMinor).toBe(1_800n);
  });

  it("floors the commission instead of rounding", () => {
    // m = 999: commission = floor(999 * 2000 / 10000) = floor(199.8) = 199
    const { commissionMinor, winnerReturnMinor } = calculatePayout(toMinor(999n));

    expect(commissionMinor).toBe(199n);
    expect(winnerReturnMinor).toBe(1_799n);
  });

  it("uses the fixed 20% streamer commission by default", () => {
    const { commissionMinor } = calculatePayout(toMinor(10_000n));

    expect(STREAMER_COMMISSION_BPS).toBe(2_000);
    expect(commissionMinor).toBe(2_000n);
  });

  it("returns zero commission and full 2m winner return for zero matched stake", () => {
    const result = calculatePayout(toMinor(0n));

    expect(result.commissionMinor).toBe(0n);
    expect(result.winnerReturnMinor).toBe(0n);
  });
});

describe("property: commission + winner_return === 2m (PROP-04 conservation)", () => {
  it("holds for 10_000 random matched stakes", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 1_000_000_000_000n }), (m) => {
        const { commissionMinor, winnerReturnMinor } = calculatePayout(toMinor(m));
        const pool = scaleByRatio(toMinor(m), 2, 1);
        return add(commissionMinor, winnerReturnMinor) === pool;
      }),
      { numRuns: 10_000, seed: 42 },
    );
  });

  it("winner_return is always >= floor(1.8m) (acceptance criterion)", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 1_000_000_000_000n }), (m) => {
        const { winnerReturnMinor } = calculatePayout(toMinor(m));
        const floor18m = (m * 18n) / 10n;
        return winnerReturnMinor >= floor18m;
      }),
      { numRuns: 10_000, seed: 42 },
    );
  });
});
