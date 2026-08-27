import { DomainError } from "@/domain/errors";
import { assertTransition } from "@/domain/betting/order-state";
import { createBetOrder, type BetOrder } from "@/domain/betting/order";
import { add, negate } from "@/domain/money/arith";
import { ZERO_MINOR } from "@/domain/money/types";
import type {
  AuditWriter,
  BetOrderRepository,
  Clock,
  EconomicProfileRepository,
  IdGenerator,
  LedgerWriter,
  MarketRepository,
  UnitOfWork,
} from "@/domain/ports";
import { betCancelledEvent } from "@/application/audit/writer";

export interface CancelOrderInput {
  readonly actorId: string;
  readonly orderId: string;
}

export interface CancelOrderDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly markets: (tx: Tx) => MarketRepository;
  readonly economicProfiles: (tx: Tx) => EconomicProfileRepository;
  readonly betOrders: (tx: Tx, ownerId: string) => BetOrderRepository;
  readonly ledger: LedgerWriter<Tx>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

/**
 * Cancels the still-unmatched portion of an owner's own order (T-510). Only the unmatched
 * remainder is released — an already-matched portion is locked into an active allocation and
 * can only unwind via settlement/void, never via cancellation.
 */
export class CancelOrderUseCase<Tx> {
  constructor(private readonly deps: CancelOrderDeps<Tx>) {}

  async execute(input: CancelOrderInput): Promise<BetOrder> {
    return this.deps.uow.run(async (tx) => {
      const order = await this.deps.betOrders(tx, input.actorId).findById(input.orderId);
      if (!order) {
        throw new DomainError("RESOURCE_NOT_FOUND", "bet order not found", {
          details: { orderId: input.orderId },
        });
      }

      const market = await this.deps.markets(tx).findById(order.marketId);
      if (!market) {
        throw new DomainError("RESOURCE_NOT_FOUND", "market not found", {
          details: { marketId: order.marketId },
        });
      }

      const economicProfile = await this.deps
        .economicProfiles(tx)
        .findById(market.economicProfileId);
      if (!economicProfile) {
        throw new DomainError("RESOURCE_NOT_FOUND", "economic profile not found", {
          details: { economicProfileId: market.economicProfileId },
        });
      }

      const releasedMinor = order.unmatchedMinor;
      const updated = createBetOrder({
        ...order,
        unmatchedMinor: ZERO_MINOR,
        releasedMinor: add(order.releasedMinor, releasedMinor),
        status: "CANCELLED",
        updatedAt: this.deps.clock.now(),
      });

      assertTransition(order.status, updated.status, {
        actor: "USER",
        marketStatus: market.status,
      });

      let refundTransactionId: string | undefined;
      if (releasedMinor > ZERO_MINOR) {
        const refund = await this.deps.ledger.post(tx, {
          id: this.deps.ids.next(),
          kind: "VOID_REFUND",
          referenceType: "bet_order",
          referenceId: order.id,
          idempotencyKey: `cancel:${order.id}`,
          actorType: "USER",
          actorId: input.actorId,
          entries: [
            {
              accountKey: `USER_LOCKED:${order.userId}`,
              currency: economicProfile.currency,
              signedAmountMinor: negate(releasedMinor),
            },
            {
              accountKey: `USER_AVAILABLE:${order.userId}`,
              currency: economicProfile.currency,
              signedAmountMinor: releasedMinor,
            },
          ],
        });
        refundTransactionId = refund.id;
      }

      await this.deps.betOrders(tx, order.userId).save(updated);
      await this.deps.audit.record(
        tx,
        betCancelledEvent(input.actorId, order.id, refundTransactionId),
      );

      return updated;
    });
  }
}
