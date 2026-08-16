import { DomainError } from "../errors";
import { add, scaleByRatio } from "../money/arith";
import type { Minor } from "../money/types";

/** Integer odds representation: num/den, e.g. 1.8x = {num:18, den:10}. See BETTING_ENGINE.md §1. */
export interface OddsRatio {
  readonly num: number;
  readonly den: number;
}

function assertValidOdds(odds: OddsRatio): void {
  if (!Number.isInteger(odds.num) || !Number.isInteger(odds.den) || odds.den <= 0 || odds.num < 0) {
    throw new RangeError(
      "odds must be a non-negative integer numerator over a positive integer denominator",
    );
  }
}

/**
 * A matched pair with stakes s_a/s_b and odds o_a/o_b is self-funding iff
 * s_a*o_a <= s_a+s_b AND s_b*o_b <= s_a+s_b (BETTING_ENGINE.md §3). Checked
 * by cross-multiplication so no division/float is involved.
 */
export function isSelfFunding(
  stakeA: Minor,
  oddsA: OddsRatio,
  stakeB: Minor,
  oddsB: OddsRatio,
): boolean {
  assertValidOdds(oddsA);
  assertValidOdds(oddsB);

  const pool = add(stakeA, stakeB);
  const sideAExposure = scaleByRatio(stakeA, oddsA.num, oddsA.den);
  const sideBExposure = scaleByRatio(stakeB, oddsB.num, oddsB.den);

  return sideAExposure <= pool && sideBExposure <= pool;
}

export function assertSelfFunding(
  stakeA: Minor,
  oddsA: OddsRatio,
  stakeB: Minor,
  oddsB: OddsRatio,
): void {
  if (!isSelfFunding(stakeA, oddsA, stakeB, oddsB)) {
    throw new DomainError(
      "UNSUPPORTED_MARKET_MODEL",
      "matched pair violates the self-funding constraint (payout would exceed the pool)",
      { details: { stakeA: stakeA.toString(), stakeB: stakeB.toString(), oddsA, oddsB } },
    );
  }
}
