import { STREAMER_COMMISSION_BPS } from "../money/bps";
import { mulBps, scaleByRatio, sub } from "../money/arith";
import type { Minor } from "../money/types";

export interface PayoutResult {
  readonly commissionMinor: Minor;
  readonly winnerReturnMinor: Minor;
}

/**
 * Fixed 1.8x odds settlement per Claude/domain/BETTING_ENGINE.md:
 * commission = floor(m * commission_bps / 10_000)
 * winner_return = 2m - commission
 *
 * `m` is the matched stake on one side of a fully-matched pair, so the total
 * pool is 2m. commission + winner_return === 2m always (PROP-04).
 */
export function calculatePayout(
  matchedStakeMinor: Minor,
  commissionBps: number = STREAMER_COMMISSION_BPS,
): PayoutResult {
  const commissionMinor = mulBps(matchedStakeMinor, commissionBps);
  const poolMinor = scaleByRatio(matchedStakeMinor, 2, 1);
  const winnerReturnMinor = sub(poolMinor, commissionMinor);
  return { commissionMinor, winnerReturnMinor };
}
