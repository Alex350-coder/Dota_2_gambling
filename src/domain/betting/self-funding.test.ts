import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { toMinor } from "../money/types";
import { assertSelfFunding, isSelfFunding, type OddsRatio } from "./self-funding";

const MVP_ODDS: OddsRatio = { num: 18, den: 10 };

describe("isSelfFunding", () => {
  it("is true for the MVP model: equal stakes at 1.8x odds", () => {
    const result = isSelfFunding(toMinor(100n), MVP_ODDS, toMinor(100n), MVP_ODDS);

    expect(result).toBe(true);
  });

  it("is true at the exact boundary (odds * stake === pool)", () => {
    // stakeA=100, odds 2.0x -> 200 <= pool(200) exactly
    const evenOdds: OddsRatio = { num: 2, den: 1 };
    const result = isSelfFunding(toMinor(100n), evenOdds, toMinor(100n), evenOdds);

    expect(result).toBe(true);
  });

  it("is false when one side's odds would pay out more than the pool", () => {
    // stakeA=100 at 2.1x -> 210 > pool(200)
    const tooHigh: OddsRatio = { num: 21, den: 10 };
    const result = isSelfFunding(toMinor(100n), tooHigh, toMinor(100n), MVP_ODDS);

    expect(result).toBe(false);
  });

  it("holds for asymmetric stakes as long as each side's payout stays within the pool", () => {
    // stakeA=200, stakeB=100, pool=300. A at 1.5x -> 300 <= 300. B at 1.8x -> 180 <= 300.
    const result = isSelfFunding(toMinor(200n), { num: 15, den: 10 }, toMinor(100n), MVP_ODDS);

    expect(result).toBe(true);
  });
});

describe("assertSelfFunding", () => {
  it("does not throw for a valid self-funding pair", () => {
    expect(() => {
      assertSelfFunding(toMinor(100n), MVP_ODDS, toMinor(100n), MVP_ODDS);
    }).not.toThrow();
  });

  it("throws a DomainError with code UNSUPPORTED_MARKET_MODEL when violated", () => {
    const tooHigh: OddsRatio = { num: 21, den: 10 };

    expect(() => {
      assertSelfFunding(toMinor(100n), tooHigh, toMinor(100n), MVP_ODDS);
    }).toThrow(expect.objectContaining({ code: "UNSUPPORTED_MARKET_MODEL" }));
  });
});

describe("property: the MVP 1.8x/1.8x model is always self-funding", () => {
  it("holds for 10_000 random equal-stake pairs", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 1_000_000_000_000n }), (m) => {
        return isSelfFunding(toMinor(m), MVP_ODDS, toMinor(m), MVP_ODDS);
      }),
      { numRuns: 10_000, seed: 42 },
    );
  });
});
