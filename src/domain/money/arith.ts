import { assertValidBps, BPS_DENOMINATOR } from "./bps";
import { toMinor, type Minor } from "./types";

export function add(a: Minor, b: Minor): Minor {
  return toMinor(a + b);
}

/** Fails closed: throws RangeError rather than allow a negative balance. */
export function sub(a: Minor, b: Minor): Minor {
  return toMinor(a - b);
}

/** Signed debit for a ledger entry (`signedAmountMinor` is a plain bigint, not `Minor`). */
export function negate(amount: Minor): bigint {
  return 0n - amount;
}

function toBpsBigInt(bps: number): bigint {
  assertValidBps(bps);
  return BigInt(bps);
}

/**
 * floor(amount * numerator / denominator). The general integer-ratio scale
 * used to express odds (e.g. 18/10 = 1.8x) without floating point.
 */
export function scaleByRatio(amount: Minor, numerator: number, denominator: number): Minor {
  if (!Number.isInteger(numerator) || numerator < 0) {
    throw new RangeError("numerator must be a non-negative integer");
  }
  if (!Number.isInteger(denominator) || denominator <= 0) {
    throw new RangeError("denominator must be a positive integer");
  }
  return toMinor((amount * BigInt(numerator)) / BigInt(denominator));
}

/** floor(amount * bps / 10_000), per BETTING_ENGINE.md rounding rule. */
export function mulBps(amount: Minor, bps: number): Minor {
  const bpsValue = toBpsBigInt(bps);
  return scaleByRatio(amount, Number(bpsValue), Number(BPS_DENOMINATOR));
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
