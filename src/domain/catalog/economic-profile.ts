import { assertValidBps, PLATFORM_FEE_BPS, STREAMER_COMMISSION_BPS } from "../money/bps";
import { toMinor, type Minor } from "../money/types";

/**
 * Economic parameters snapshotted onto every order at placement time.
 * See Claude/domain/BETTING_ENGINE.md §1 (economic_profiles table).
 */
export interface EconomicProfile {
  readonly oddsNum: number;
  readonly oddsDen: number;
  readonly streamerCommissionBps: number;
  readonly platformFeeBps: number;
  readonly currency: string;
  readonly minorUnitExponent: number;
  readonly minStakeMinor: Minor;
  readonly maxStakeMinor: Minor;
}

export const MVP_ECONOMIC_PROFILE: EconomicProfile = {
  oddsNum: 18,
  oddsDen: 10,
  streamerCommissionBps: STREAMER_COMMISSION_BPS,
  platformFeeBps: PLATFORM_FEE_BPS,
  currency: "PEN",
  minorUnitExponent: 2,
  minStakeMinor: toMinor(100n),
  maxStakeMinor: toMinor(10_000_000n),
};

function assertValidProfile(profile: EconomicProfile): void {
  if (!Number.isInteger(profile.oddsNum) || profile.oddsNum <= 0) {
    throw new RangeError("oddsNum must be a positive integer");
  }
  if (!Number.isInteger(profile.oddsDen) || profile.oddsDen <= 0) {
    throw new RangeError("oddsDen must be a positive integer");
  }
  assertValidBps(profile.streamerCommissionBps);
  assertValidBps(profile.platformFeeBps);
  if (profile.minStakeMinor > profile.maxStakeMinor) {
    throw new RangeError("minStakeMinor must not exceed maxStakeMinor");
  }
}

export function createEconomicProfile(overrides: Partial<EconomicProfile> = {}): EconomicProfile {
  const profile: EconomicProfile = { ...MVP_ECONOMIC_PROFILE, ...overrides };
  assertValidProfile(profile);
  return profile;
}
