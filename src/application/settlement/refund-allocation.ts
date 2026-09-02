import { DomainError } from "@/domain/errors";
import { assertTransitionMatchAllocation } from "@/domain/settlement";
import { add, negate, toMinor, ZERO_MINOR } from "@/domain/money";
import type {
  AllocationRepository,
  BookRepository,
  EconomicProfileRepository,
  IdGenerator,
  LedgerWriter,
  Market,
} from "@/domain/ports";
import type { BetOrder } from "@/domain/betting";

export interface RefundAllocationsDeps<Tx> {
  readonly allocations: (tx: Tx) => AllocationRepository;
  readonly book: (tx: Tx) => BookRepository;
  readonly economicProfiles: (tx: Tx) => EconomicProfileRepository;
  readonly ledger: LedgerWriter<Tx>;
  readonly ids: IdGenerator;
}

export interface RefundAllocationsResult {
  readonly allocationsVoided: number;
  readonly refundTotalMinor: bigint;
}

/**
 * `SETTLEMENT.md` §6, row 1 ("Match cancelled / not played"): every still-`ACTIVE` allocation
 * on a market voided before a real result exists refunds `m` back to *each* side — no winner,
 * no commission — rather than Phase 2's winner-take-`winnerReturn` math. Reuses the same
 * `settle:<allocationId>` idempotency key `SETTLEMENT.md` §5 documents for "Allocation" (INV-14
 * doesn't distinguish payout from refund, both are terminal per-allocation ledger posts), so a
 * retried void after a crash is exactly as safe as a retried settle.
 */
export async function refundAllocationsOnVoid<Tx>(
  tx: Tx,
  deps: RefundAllocationsDeps<Tx>,
  market: Market,
): Promise<RefundAllocationsResult> {
  const economicProfile = await deps.economicProfiles(tx).findById(market.economicProfileId);
  if (!economicProfile) {
    throw new DomainError("RESOURCE_NOT_FOUND", "economic profile not found for market", {
      details: { marketId: market.id, economicProfileId: market.economicProfileId },
    });
  }

  const orders = await deps.book(tx).findAllByMarketId(market.id);
  const orderById = new Map<string, BetOrder>(orders.map((order) => [order.id, order]));

  const activeAllocations = await deps.allocations(tx).listActiveByMarketId(market.id);

  let allocationsVoided = 0;
  let refundTotalMinor = ZERO_MINOR;

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

    const matchedMinor = toMinor(allocation.matchedMinor);

    await deps.ledger.post(tx, {
      id: deps.ids.next(),
      kind: "VOID_REFUND",
      referenceType: "match_allocation",
      referenceId: allocation.id,
      idempotencyKey: `settle:${allocation.id}`,
      actorType: "SYSTEM",
      actorId: undefined,
      entries: [
        {
          accountKey: `USER_AVAILABLE:${orderA.userId}`,
          currency: economicProfile.currency,
          signedAmountMinor: matchedMinor,
        },
        {
          accountKey: `USER_AVAILABLE:${orderB.userId}`,
          currency: economicProfile.currency,
          signedAmountMinor: matchedMinor,
        },
        {
          accountKey: `MARKET_ESCROW:${market.id}`,
          currency: economicProfile.currency,
          signedAmountMinor: negate(add(matchedMinor, matchedMinor)),
        },
      ],
    });

    assertTransitionMatchAllocation("ACTIVE", "VOIDED", { actor: "SYSTEM" });
    const updated = await deps.allocations(tx).updateStatus(allocation.id, "VOIDED");
    if (updated) {
      allocationsVoided += 1;
      refundTotalMinor = add(refundTotalMinor, add(matchedMinor, matchedMinor));
    }
  }

  return { allocationsVoided, refundTotalMinor };
}
