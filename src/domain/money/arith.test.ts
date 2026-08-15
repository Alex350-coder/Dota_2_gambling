import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { add, mulBps, scaleByRatio, splitFloor, sub } from "./arith";
import { toMinor } from "./types";

describe("add", () => {
  it("adds two Minor values", () => {
    expect(add(toMinor(100n), toMinor(50n))).toBe(150n);
  });

  it("returns the other operand when adding zero", () => {
    expect(add(toMinor(100n), toMinor(0n))).toBe(100n);
  });
});

describe("sub", () => {
  it("subtracts two Minor values", () => {
    expect(sub(toMinor(100n), toMinor(30n))).toBe(70n);
  });

  it("allows a result of exactly zero", () => {
    expect(sub(toMinor(100n), toMinor(100n))).toBe(0n);
  });

  it("throws when the result would be negative", () => {
    expect(() => sub(toMinor(10n), toMinor(20n))).toThrow(RangeError);
  });
});

describe("mulBps", () => {
  it("computes floor(amount * bps / 10_000)", () => {
    // 1000 minor units at 2000 bps (20%) = 200
    expect(mulBps(toMinor(1_000n), 2_000)).toBe(200n);
  });

  it("floors instead of rounding", () => {
    // 999 * 2000 / 10000 = 199.8 -> floors to 199
    expect(mulBps(toMinor(999n), 2_000)).toBe(199n);
  });

  it("returns zero for zero bps", () => {
    expect(mulBps(toMinor(1_000n), 0)).toBe(0n);
  });

  it("returns the full amount for 10_000 bps (100%)", () => {
    expect(mulBps(toMinor(1_234n), 10_000)).toBe(1_234n);
  });

  it("throws for a negative bps value", () => {
    expect(() => mulBps(toMinor(1_000n), -1)).toThrow(RangeError);
  });

  it("throws for a bps value above 10_000", () => {
    expect(() => mulBps(toMinor(1_000n), 10_001)).toThrow(RangeError);
  });

  it("throws for a non-integer bps value", () => {
    expect(() => mulBps(toMinor(1_000n), 1.5)).toThrow(RangeError);
  });
});

describe("splitFloor", () => {
  it("splits an amount into a floored part and an exact remainder", () => {
    const { part, remainder } = splitFloor(toMinor(999n), 2_000);

    expect(part).toBe(199n);
    expect(remainder).toBe(800n);
    expect(part + remainder).toBe(999n);
  });

  it("conserves the total for zero bps", () => {
    const { part, remainder } = splitFloor(toMinor(500n), 0);

    expect(part).toBe(0n);
    expect(remainder).toBe(500n);
  });

  it("conserves the total for 10_000 bps", () => {
    const { part, remainder } = splitFloor(toMinor(500n), 10_000);

    expect(part).toBe(500n);
    expect(remainder).toBe(0n);
  });
});

describe("scaleByRatio", () => {
  it("computes floor(amount * numerator / denominator)", () => {
    // 1.8x odds on 100 -> floor(100*18/10) = 180
    expect(scaleByRatio(toMinor(100n), 18, 10)).toBe(180n);
  });

  it("floors instead of rounding", () => {
    // 33 * 18 / 10 = 59.4 -> floors to 59
    expect(scaleByRatio(toMinor(33n), 18, 10)).toBe(59n);
  });

  it("throws for a zero or negative denominator", () => {
    expect(() => scaleByRatio(toMinor(100n), 18, 0)).toThrow(RangeError);
    expect(() => scaleByRatio(toMinor(100n), 18, -1)).toThrow(RangeError);
  });

  it("throws for a negative numerator", () => {
    expect(() => scaleByRatio(toMinor(100n), -1, 10)).toThrow(RangeError);
  });
});

describe("property: splitFloor always conserves the total (PROP-01)", () => {
  it("part + remainder === total for 10_000 random totals and bps", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10_000_000_000n }),
        fc.integer({ min: 0, max: 10_000 }),
        (total, bps) => {
          const { part, remainder } = splitFloor(toMinor(total), bps);
          return part + remainder === total;
        },
      ),
      { numRuns: 10_000, seed: 42 },
    );
  });
});
