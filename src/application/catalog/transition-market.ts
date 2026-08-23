import { DomainError } from "@/domain/errors";
import { assertTransition } from "@/domain/catalog";
import type { MarketActor, MarketStatus } from "@/domain/catalog";
import type {
  AuditWriter,
  Clock,
  Market,
  MarketRepository,
  OutcomeRepository,
  UnitOfWork,
} from "@/domain/ports";
import { marketStatusChangedEvent } from "@/application/audit/writer";

export interface TransitionMarketInput {
  readonly actorId: string | null;
  readonly marketId: string;
  readonly actor: MarketActor;
  readonly to: MarketStatus;
  readonly manualClose?: boolean;
  readonly matchPlayed?: boolean;
}

export interface TransitionMarketDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly markets: (tx: Tx) => MarketRepository;
  readonly outcomes: (tx: Tx) => OutcomeRepository;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

/**
 * Wraps the `market-state.ts` transition guards in a persisted, audited
 * transaction (T-407). `economicProfileSet` and `hasOrders` are always `true`
 * / `false` respectively here — `economicProfileId` is a NOT NULL column set
 * at market creation, and Phase 4 precedes bet placement (Plan.md P4 scope),
 * so no market can have orders yet.
 */
export class TransitionMarketUseCase<Tx> {
  constructor(private readonly deps: TransitionMarketDeps<Tx>) {}

  async execute(input: TransitionMarketInput): Promise<Market> {
    return this.deps.uow.run(async (tx) => {
      const markets = this.deps.markets(tx);
      const market = await markets.findById(input.marketId);
      if (!market) {
        throw new DomainError("RESOURCE_NOT_FOUND", "market not found", {
          details: { marketId: input.marketId },
        });
      }

      const outcomeCount = (await this.deps.outcomes(tx).listByMarketId(market.id)).length;
      const now = this.deps.clock.now();

      assertTransition(market.status, input.to, {
        actor: input.actor,
        now,
        closesAt: market.closesAt,
        outcomeCount,
        economicProfileSet: true,
        hasOrders: false,
        ...(input.manualClose !== undefined ? { manualClose: input.manualClose } : {}),
        ...(input.matchPlayed !== undefined ? { matchPlayed: input.matchPlayed } : {}),
      });

      const updated = await markets.updateStatus(market.id, input.to);
      await this.deps.audit.record(tx, marketStatusChangedEvent(input.actorId, market.id));
      return updated;
    });
  }
}
