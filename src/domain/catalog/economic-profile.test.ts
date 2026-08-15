import { describe, expect, it } from "vitest";
import { toMinor } from "../money/types";
import { createEconomicProfile, MVP_ECONOMIC_PROFILE } from "./economic-profile";

describe("MVP_ECONOMIC_PROFILE", () => {
  it("fixes 1.8x odds as 18/10", () => {
    expect(MVP_ECONOMIC_PROFILE.oddsNum).toBe(18);
    expect(MVP_ECONOMIC_PROFILE.oddsDen).toBe(10);
  });

  it("fixes the streamer commission at 2_000 bps and the platform fee at 0", () => {
    expect(MVP_ECONOMIC_PROFILE.streamerCommissionBps).toBe(2_000);
    expect(MVP_ECONOMIC_PROFILE.platformFeeBps).toBe(0);
  });

  it("uses PEN with a 2-digit minor unit exponent", () => {
    expect(MVP_ECONOMIC_PROFILE.currency).toBe("PEN");
    expect(MVP_ECONOMIC_PROFILE.minorUnitExponent).toBe(2);
  });

  it("sets the minimum stake to 100 minor units (S/1.00)", () => {
    expect(MVP_ECONOMIC_PROFILE.minStakeMinor).toBe(100n);
  });
});

describe("createEconomicProfile", () => {
  it("returns the MVP defaults when called with no overrides", () => {
    const profile = createEconomicProfile();

    expect(profile).toEqual(MVP_ECONOMIC_PROFILE);
  });

  it("allows overriding maxStakeMinor per market", () => {
    const profile = createEconomicProfile({ maxStakeMinor: toMinor(1_000_000n) });

    expect(profile.maxStakeMinor).toBe(1_000_000n);
    expect(profile.minStakeMinor).toBe(MVP_ECONOMIC_PROFILE.minStakeMinor);
  });

  it("throws when minStakeMinor exceeds maxStakeMinor", () => {
    expect(() => {
      createEconomicProfile({ minStakeMinor: toMinor(500n), maxStakeMinor: toMinor(100n) });
    }).toThrow(RangeError);
  });

  it("throws for an invalid commission bps", () => {
    expect(() => {
      createEconomicProfile({ streamerCommissionBps: 10_001 });
    }).toThrow(RangeError);
  });

  it("throws for an invalid platform fee bps", () => {
    expect(() => {
      createEconomicProfile({ platformFeeBps: -1 });
    }).toThrow(RangeError);
  });

  it("throws for non-positive odds", () => {
    expect(() => {
      createEconomicProfile({ oddsNum: 0 });
    }).toThrow(RangeError);
    expect(() => {
      createEconomicProfile({ oddsDen: 0 });
    }).toThrow(RangeError);
  });
});
