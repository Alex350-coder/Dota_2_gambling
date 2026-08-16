import { describe, expect, it } from "vitest";
import { assertValidBps, BPS_DENOMINATOR, PLATFORM_FEE_BPS, STREAMER_COMMISSION_BPS } from "./bps";

describe("economic constants", () => {
  it("fixes the streamer commission at 20% (2_000 bps)", () => {
    expect(STREAMER_COMMISSION_BPS).toBe(2_000);
  });

  it("fixes the platform fee at 0%", () => {
    expect(PLATFORM_FEE_BPS).toBe(0);
  });

  it("defines the basis-points denominator as 10_000", () => {
    expect(BPS_DENOMINATOR).toBe(10_000n);
  });
});

describe("assertValidBps", () => {
  it("accepts integers in [0, 10_000]", () => {
    expect(() => {
      assertValidBps(0);
    }).not.toThrow();
    expect(() => {
      assertValidBps(2_000);
    }).not.toThrow();
    expect(() => {
      assertValidBps(10_000);
    }).not.toThrow();
  });

  it("throws for a negative value", () => {
    expect(() => {
      assertValidBps(-1);
    }).toThrow(RangeError);
  });

  it("throws for a value above 10_000", () => {
    expect(() => {
      assertValidBps(10_001);
    }).toThrow(RangeError);
  });

  it("throws for a non-integer value", () => {
    expect(() => {
      assertValidBps(1.5);
    }).toThrow(RangeError);
  });
});
