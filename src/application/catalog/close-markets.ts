import type { Clock, MarketRepository, UnitOfWork } from "@/domain/ports";
import type { TransitionMarketUseCase } from "./transition-market";

export interface CloseMarketsDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly markets: (tx: Tx) => MarketRepository;
  readonly transitionMarket: TransitionMarketUseCase<Tx>;
  readonly clock: Clock;
}

export interface CloseMarketsResult {
  readonly closedMarketIds: readonly string[];
  readonly failedMarketIds: readonly string[];
}

/**
 * Idempotent scheduler sweep (T-408): closes every `OPEN` market whose
 * `closesAt` has passed. Each market transitions in its own transaction so
 * one failure (e.g. a concurrent admin-driven transition) doesn't block the
 * rest of the sweep. Re-running finds nothing left to close, since a closed
 * market no longer matches `findOpenPastClosesAt`.
 */
export class CloseMarketsUseCase<Tx> {
  constructor(private readonly deps: CloseMarketsDeps<Tx>) {}

  async execute(): Promise<CloseMarketsResult> {
    const now = this.deps.clock.now();
    const expired = await this.deps.uow.run((tx) =>
      this.deps.markets(tx).findOpenPastClosesAt(now),
    );

    const closedMarketIds: string[] = [];
    const failedMarketIds: string[] = [];
    for (const market of expired) {
      try {
        await this.deps.transitionMarket.execute({
          actorId: null,
          marketId: market.id,
          actor: "SYSTEM",
          to: "CLOSED",
        });
        closedMarketIds.push(market.id);
      } catch {
        failedMarketIds.push(market.id);
      }
    }
    return { closedMarketIds, failedMarketIds };
  }
}
