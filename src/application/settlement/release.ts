import { releaseUnmatchedOnClose, type ReleaseUnmatchedDeps } from "@/application/betting";
import type { Market } from "@/domain/ports";

export type ReleaseUnmatchedForSettlementDeps<Tx> = ReleaseUnmatchedDeps<Tx>;

/**
 * Phase 1 of `SETTLEMENT.md` §4: release every still-unmatched amount back to its owner's
 * available balance before any payout math runs. The batch-release logic already exists as
 * `releaseUnmatchedOnClose` (T-511) and is already invoked once, eagerly, from
 * `TransitionMarketUseCase`'s `onClosed` hook the moment a market becomes `CLOSED` — by the
 * time settlement reaches this call, `findOpenOrdersByMarket` normally returns nothing left to
 * release. This thin re-export exists so settlement has its own named Phase 1 entry point
 * (T-607) without duplicating the release algorithm: calling it again here is a defensive,
 * idempotent no-op (`release:<orderId>` keys, `WHERE status = 'OPEN'` scoping) that keeps
 * settlement correct even if that invariant is ever violated — e.g. a market forced straight
 * to `CLOSED` by a path that skips the hook, or a future admin override.
 */
export async function releaseUnmatchedForSettlement<Tx>(
  tx: Tx,
  deps: ReleaseUnmatchedForSettlementDeps<Tx>,
  market: Market,
): Promise<void> {
  await releaseUnmatchedOnClose(tx, deps, market);
}
