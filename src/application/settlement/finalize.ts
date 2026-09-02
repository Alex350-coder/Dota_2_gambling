import { assertTransition as assertTransitionBetOrder, createBetOrder } from "@/domain/betting";
import { assertTransition as assertTransitionMarket } from "@/domain/catalog";
import { assertTransitionSettlementRun } from "@/domain/settlement";
import { ZERO_MINOR } from "@/domain/money";
import { DomainError } from "@/domain/errors";
import type {
  AuditWriter,
  BetOrderRepository,
  BookRepository,
  Clock,
  EconomicProfileRepository,
  LedgerWriter,
  Market,
  MarketRepository,
  SettlementRun,
  SettlementRunRepository,
} from "@/domain/ports";
import { marketStatusChangedEvent } from "@/application/audit/writer";

export interface FinalizeSettlementDeps<Tx> {
  readonly markets: (tx: Tx) => MarketRepository;
  readonly settlementRuns: (tx: Tx) => SettlementRunRepository;
  readonly book: (tx: Tx) => BookRepository;
  readonly betOrders: (tx: Tx, ownerId: string) => BetOrderRepository;
  readonly economicProfiles: (tx: Tx) => EconomicProfileRepository;
  readonly ledger: LedgerWriter<Tx>;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

export interface FinalizeSettlementTotals {
  readonly payoutTotalMinor: bigint;
  readonly commissionTotalMinor: bigint;
  readonly refundTotalMinor: bigint;
}

/**
 * Phase 3 of `SETTLEMENT.md` §4 (T-609): the hard escrow-zero assertion, then finalisation.
 * Only called once Phase 2 has settled every `ACTIVE` allocation on the market (no batching
 * across transactions yet — T-611's large-market batching is a deliberate MVP carve-out,
 * documented in the phase completion report rather than half-built; every market settles in
 * one transaction here, same as phase 2).
 *
 * The escrow-zero check is a hard assert, not a recoverable `DomainError` a caller retries:
 * `MARKET_ESCROW:<marketId>` must sum to exactly zero after every winner payout and commission
 * leg has posted, or money has silently leaked or over-paid somewhere upstream. Throwing aborts
 * the whole transaction (no partial commit) — `INTERNAL_ERROR` is the closest existing code for
 * an invariant violation that isn't the caller's fault and isn't safely retryable as-is.
 */
export async function finalizeSettlement<Tx>(
  tx: Tx,
  deps: FinalizeSettlementDeps<Tx>,
  market: Market,
  run: SettlementRun,
  totals: FinalizeSettlementTotals,
): Promise<SettlementRun> {
  const economicProfile = await deps.economicProfiles(tx).findById(market.economicProfileId);
  if (!economicProfile) {
    throw new DomainError("RESOURCE_NOT_FOUND", "economic profile not found for market", {
      details: { marketId: market.id, economicProfileId: market.economicProfileId },
    });
  }

  const escrowBalance = await deps.ledger.balanceOf(
    tx,
    `MARKET_ESCROW:${market.id}`,
    economicProfile.currency,
  );
  if (escrowBalance !== 0n) {
    throw new DomainError(
      "INTERNAL_ERROR",
      "settlement invariant violated: market escrow did not net to zero after phase 2",
      { details: { marketId: market.id, escrowBalance: escrowBalance.toString() } },
    );
  }

  const now = deps.clock.now();
  const orders = await deps.book(tx).findAllByMarketId(market.id);
  for (const order of orders) {
    if (order.status !== "MATCHED") {
      continue;
    }
    const updated = createBetOrder({ ...order, status: "SETTLED", updatedAt: now });
    assertTransitionBetOrder(order.status, updated.status, { actor: "SYSTEM" });
    await deps.betOrders(tx, order.userId).save(updated);
  }

  const settlementRuns = deps.settlementRuns(tx);
  assertTransitionSettlementRun("IN_PROGRESS", "COMPLETED", {
    marketEscrowMinor: ZERO_MINOR,
    hasExistingCompletedRun: false,
  });
  // `run` here is the caller's freshly-updated row (post-Phase-2 `updateProgress`), so
  // `run.allocationsSettled` already reflects every allocation this run just settled.
  const completedRun = await settlementRuns.markCompleted(run.id, {
    finishedAt: now,
    allocationsSettled: run.allocationsSettled,
    payoutTotalMinor: totals.payoutTotalMinor,
    commissionTotalMinor: totals.commissionTotalMinor,
    refundTotalMinor: totals.refundTotalMinor,
  });

  assertTransitionMarket("SETTLING", "SETTLED", {
    actor: "SYSTEM",
    settlementRunCompleted: true,
    marketEscrowMinor: ZERO_MINOR,
  });
  await deps.markets(tx).updateStatus(market.id, "SETTLED");
  await deps.audit.record(tx, marketStatusChangedEvent(null, market.id));

  return completedRun;
}
