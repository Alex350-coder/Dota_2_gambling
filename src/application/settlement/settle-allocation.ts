import { DomainError } from "@/domain/errors";
import { assertTransitionMatchAllocation, calculatePayout } from "@/domain/settlement";
import { add, negate, toMinor, ZERO_MINOR } from "@/domain/money";
import type {
  AllocationRepository,
  BookRepository,
  EconomicProfileRepository,
  IdGenerator,
  LedgerPostEntry,
  LedgerWriter,
  Market,
} from "@/domain/ports";
import type { BetOrder } from "@/domain/betting";
import { commissionLedgerEntries } from "./commission";

export interface SettleAllocationsDeps<Tx> {
  readonly allocations: (tx: Tx) => AllocationRepository;
  readonly book: (tx: Tx) => BookRepository;
  readonly economicProfiles: (tx: Tx) => EconomicProfileRepository;
  readonly ledger: LedgerWriter<Tx>;
  readonly ids: IdGenerator;
}

export interface SettleAllocationsResult {
  readonly allocationsSettled: number;
  readonly payoutTotalMinor: bigint;
  readonly commissionTotalMinor: bigint;
}

/**
 * Phase 2 of `SETTLEMENT.md` §4: pays out every still-`ACTIVE` allocation on a market whose
 * result is `CONFIRMED` with a real winning outcome (`winningOutcomeId !== null` — the void
 * case is a distinct path, T-610). Idempotent and resumable: `listActiveByMarketId` only ever
 * returns the remainder still unprocessed, and each allocation's ledger post carries the
 * `settle:<allocationId>` idempotency key `SETTLEMENT.md` §5 names as the per-allocation
 * double-payout guard.
 *
 * Payout and commission are folded into one balanced ledger transaction per allocation
 * (single idempotency key, matching the doc's algorithm) rather than the two-transaction split
 * the `SETTLE_PAYOUT`/`SETTLE_COMMISSION` kind split might otherwise suggest — `kind` here is
 * `SETTLE_PAYOUT` since payout is always present when commission is (both derive from the same
 * matched stake), while `SETTLE_COMMISSION` is left available for a future standalone
 * commission-conversion operation (SETTLEMENT.md §7).
 */
export async function settleAllocationsOnConfirmedResult<Tx>(
  tx: Tx,
  deps: SettleAllocationsDeps<Tx>,
  market: Market,
  winningOutcomeId: string,
): Promise<SettleAllocationsResult> {
  const economicProfile = await deps.economicProfiles(tx).findById(market.economicProfileId);
  if (!economicProfile) {
    throw new DomainError("RESOURCE_NOT_FOUND", "economic profile not found for market", {
      details: { marketId: market.id, economicProfileId: market.economicProfileId },
    });
  }

  const orders = await deps.book(tx).findAllByMarketId(market.id);
  const orderById = new Map<string, BetOrder>(orders.map((order) => [order.id, order]));

  const activeAllocations = await deps.allocations(tx).listActiveByMarketId(market.id);

  let allocationsSettled = 0;
  let payoutTotalMinor = ZERO_MINOR;
  let commissionTotalMinor = ZERO_MINOR;

  for (const allocation of activeAllocations) {
    const orderA = orderById.get(allocation.orderAId);
    const orderB = orderById.get(allocation.orderBId);
    if (!orderA || !orderB) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "match allocation references an order that does not belong to this market",
        { details: { allocationId: allocation.id, marketId: market.id } },
      );
    }

    const winner =
      orderA.outcomeId === winningOutcomeId
        ? orderA
        : orderB.outcomeId === winningOutcomeId
          ? orderB
          : null;
    if (!winner) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "neither side of this allocation backed the confirmed winning outcome",
        { details: { allocationId: allocation.id, winningOutcomeId } },
      );
    }

    const matchedMinor = toMinor(allocation.matchedMinor);
    const { commissionMinor, winnerReturnMinor } = calculatePayout(
      matchedMinor,
      economicProfile.streamerCommissionBps,
    );

    const entries: LedgerPostEntry[] = [
      {
        accountKey: `MARKET_ESCROW:${market.id}`,
        currency: economicProfile.currency,
        signedAmountMinor: negate(winnerReturnMinor),
      },
      {
        accountKey: `USER_AVAILABLE:${winner.userId}`,
        currency: economicProfile.currency,
        signedAmountMinor: winnerReturnMinor,
      },
      ...commissionLedgerEntries({
        marketId: market.id,
        streamerId: market.streamerId,
        currency: economicProfile.currency,
        commissionMinor,
      }),
    ];

    await deps.ledger.post(tx, {
      id: deps.ids.next(),
      kind: "SETTLE_PAYOUT",
      referenceType: "match_allocation",
      referenceId: allocation.id,
      idempotencyKey: `settle:${allocation.id}`,
      actorType: "SYSTEM",
      actorId: undefined,
      entries,
    });

    assertTransitionMatchAllocation("ACTIVE", "SETTLED", { actor: "SYSTEM" });
    const updated = await deps.allocations(tx).updateStatus(allocation.id, "SETTLED");
    if (updated) {
      allocationsSettled += 1;
      payoutTotalMinor = add(payoutTotalMinor, winnerReturnMinor);
      commissionTotalMinor = add(commissionTotalMinor, commissionMinor);
    }
  }

  return { allocationsSettled, payoutTotalMinor, commissionTotalMinor };
}
