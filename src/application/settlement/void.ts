import { assertTransition as assertTransitionBetOrder, createBetOrder } from "@/domain/betting";
import { assertTransition as assertTransitionMarket } from "@/domain/catalog";
import { DomainError } from "@/domain/errors";
import type {
  AllocationRepository,
  AuditWriter,
  BookRepository,
  Market,
  MarketRepository,
  UnitOfWork,
} from "@/domain/ports";
import { marketStatusChangedEvent } from "@/application/audit/writer";
import { releaseUnmatchedOnClose, type ReleaseUnmatchedDeps } from "@/application/betting";
import { refundAllocationsOnVoid } from "./refund-allocation";

export interface VoidMarketInput {
  readonly actorId: string;
  readonly marketId: string;
}

export interface VoidMarketDeps<Tx> extends ReleaseUnmatchedDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly markets: (tx: Tx) => MarketRepository;
  readonly allocations: (tx: Tx) => AllocationRepository;
  readonly book: (tx: Tx) => BookRepository;
  readonly acquireMarketLock: (tx: Tx, marketId: string) => Promise<void>;
  readonly audit: AuditWriter<Tx>;
}

/**
 * `SETTLEMENT.md` §6, row 1 ("Match cancelled / not played"): `SUSPENDED`/`CLOSED` -> `VOID`,
 * bypassing `SETTLING` entirely — the market-state machine only allows `VOID` directly from
 * those two statuses (`canVoidUnplayedMatch`, `matchPlayed === false`), never from `SETTLING`,
 * so this is a distinct use case rather than a branch inside `SettleMarketUseCase`. No
 * `settlement_runs` row is created: the run model exists for `SETTLING`'s resumable
 * per-allocation payout algorithm (`SETTLEMENT.md` §3), which a void market never enters.
 *
 * Same three-part shape as settlement's own algorithm, reusing exactly what commit 6/7 already
 * built: release every still-unmatched remainder (T-511's `releaseUnmatchedOnClose`, already
 * idempotent), refund every `ACTIVE` allocation `m` to each side with zero commission
 * (`refundAllocationsOnVoid`, T-610), then finalise every `MATCHED` order to `VOIDED`
 * (`MATCHED -> VOIDED` is already a valid `BetOrder` transition, `order-state.ts`).
 */
export class VoidMarketUseCase<Tx> {
  constructor(private readonly deps: VoidMarketDeps<Tx>) {}

  async execute(input: VoidMarketInput): Promise<Market> {
    return this.deps.uow.run(async (tx) => {
      await this.deps.acquireMarketLock(tx, input.marketId);

      const markets = this.deps.markets(tx);
      const market = await markets.findById(input.marketId);
      if (!market) {
        throw new DomainError("RESOURCE_NOT_FOUND", "market not found", {
          details: { marketId: input.marketId },
        });
      }

      assertTransitionMarket(market.status, "VOID", { actor: "ADMIN", matchPlayed: false });
      const voided = await markets.updateStatus(market.id, "VOID");
      await this.deps.audit.record(tx, marketStatusChangedEvent(input.actorId, market.id));

      await releaseUnmatchedOnClose(tx, this.deps, voided);
      await refundAllocationsOnVoid(tx, this.deps, voided);

      const now = this.deps.clock.now();
      const orders = await this.deps.book(tx).findAllByMarketId(voided.id);
      for (const order of orders) {
        if (order.status !== "MATCHED") {
          continue;
        }
        const updated = createBetOrder({ ...order, status: "VOIDED", updatedAt: now });
        assertTransitionBetOrder(order.status, updated.status, { actor: "SYSTEM" });
        await this.deps.betOrders(tx, order.userId).save(updated);
      }

      return voided;
    });
  }
}
