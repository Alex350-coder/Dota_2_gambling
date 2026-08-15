/** Basis-points denominator: 10_000 bps = 100%. */
export const BPS_DENOMINATOR = 10_000n;

/** Fixed streamer commission on matched stake, per BETTING_ENGINE.md: 20%. */
export const STREAMER_COMMISSION_BPS = 2_000;

/** The platform provides no capital and takes no cut. Never change without RULE-B sign-off. */
export const PLATFORM_FEE_BPS = 0;

export function assertValidBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new RangeError("bps must be an integer in [0, 10_000]");
  }
}
