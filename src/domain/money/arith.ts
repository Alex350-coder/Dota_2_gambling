import { assertValidBps, BPS_DENOMINATOR } from "./bps";
import { toMinor, type Minor } from "./types";

export function add(a: Minor, b: Minor): Minor {
  return toMinor(a + b);
}

/** Fails closed: throws RangeError rather than allow a negative balance. */
export function sub(a: Minor, b: Minor): Minor {
  return toMinor(a - b);
}

function toBpsBigInt(bps: number): bigint {
  assertValidBps(bps);
  return BigInt(bps);
}

/** floor(amount * bps / 10_000), per BETTING_ENGINE.md rounding rule. */
export function mulBps(amount: Minor, bps: number): Minor {
  const bpsValue = toBpsBigInt(bps);
  return toMinor((amount * bpsValue) / BPS_DENOMINATOR);
}

export interface SplitFloorResult {
  readonly part: Minor;
  readonly remainder: Minor;
}

/**
 * Splits `total` into a bps-derived part (floored) and the exact remainder,
 * so `part + remainder === total` always holds (PROP-01 conservation).
 */
export function splitFloor(total: Minor, bps: number): SplitFloorResult {
  const part = mulBps(total, bps);
  const remainder = toMinor(total - part);
  return { part, remainder };
}
