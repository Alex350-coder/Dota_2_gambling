import { DomainError } from "@/domain/errors";
import type { BetOrder } from "@/domain/betting";
import type {
  AllocationRepository,
  BetOrderRepository,
  LedgerWriter,
  MatchAllocation,
  UnitOfWork,
} from "@/domain/ports";

export interface GetBetInput {
  readonly actorId: string;
  readonly orderId: string;
}

/** Per-allocation settlement outcome, derived from the actual ledger credit rather than
 * recomputed payout math — `returnMinor` is 0n for the losing side of a settled allocation
 * (no `USER_AVAILABLE` credit was ever posted for it), and `commissionMinor` is arithmetically
 * derived (`2 * matchedMinor - returnMinor`) from that same real figure, never duplicated
 * from `calculatePayout` (T-806). */
export interface AllocationSettlementDetail {
  readonly allocationId: string;
  readonly matchedMinor: bigint;
  readonly returnMinor: bigint;
  readonly commissionMinor: bigint;
  readonly netMinor: bigint;
}

export interface GetBetResult {
  readonly order: BetOrder;
  readonly allocations: readonly MatchAllocation[];
  readonly settlement: readonly AllocationSettlementDetail[];
}

export interface GetBetDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly betOrders: (tx: Tx, ownerId: string) => BetOrderRepository;
  readonly allocations: (tx: Tx, ownerId: string) => AllocationRepository;
  readonly ledger: LedgerWriter<Tx>;
}

const SETTLED_ALLOCATION_STATUSES = new Set(["SETTLED", "VOIDED"]);

/**
 * Owner-scoped detail lookup (T-513). Cross-user access is indistinguishable from
 * "does not exist" — `RESOURCE_NOT_FOUND` (404), never a 403, per RULE-E02. Allocation
 * rows never expose the counterparty's user id, only the two order ids.
 */
export class GetBetUseCase<Tx> {
  constructor(private readonly deps: GetBetDeps<Tx>) {}

  async execute(input: GetBetInput): Promise<GetBetResult> {
    return this.deps.uow.run(async (tx) => {
      const order = await this.deps.betOrders(tx, input.actorId).findById(input.orderId);
      if (!order) {
        throw new DomainError("RESOURCE_NOT_FOUND", "bet order not found", {
          details: { orderId: input.orderId },
        });
      }

      const allocations = await this.deps.allocations(tx, input.actorId).findByOrderId(order.id);

      const settlement: AllocationSettlementDetail[] = [];
      for (const allocation of allocations) {
        if (!SETTLED_ALLOCATION_STATUSES.has(allocation.status)) {
          continue;
        }
        const entries = await this.deps.ledger.listEntriesForReference(
          tx,
          "match_allocation",
          allocation.id,
        );
        const credited = entries.filter(
          (entry) => entry.accountKey === `USER_AVAILABLE:${order.userId}`,
        );
        const detail = {
          returnMinor: credited.reduce((sum, entry) => sum + entry.signedAmountMinor, 0n),
        };
        const commission =
          detail.returnMinor > 0n ? 2n * allocation.matchedMinor - detail.returnMinor : 0n;
        settlement.push({
          allocationId: allocation.id,
          matchedMinor: allocation.matchedMinor,
          returnMinor: detail.returnMinor,
          commissionMinor: commission,
          netMinor: detail.returnMinor - allocation.matchedMinor,
        });
      }

      return { order, allocations, settlement };
    });
  }
}
