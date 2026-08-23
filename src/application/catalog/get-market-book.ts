import { DomainError } from "@/domain/errors";
import type { MarketRepository, OutcomeRepository, UnitOfWork } from "@/domain/ports";

interface MarketBookOutcome {
  readonly outcomeId: string;
  readonly code: string;
  readonly label: string;
  /** Aggregate unmatched stake for this outcome — never per-order or per-user (RULE-E02). */
  readonly unmatchedStake: string;
}

export interface MarketBook {
  readonly marketId: string;
  readonly status: string;
  readonly outcomes: readonly MarketBookOutcome[];
}

export interface GetMarketBookInput {
  readonly marketId: string;
}

export interface GetMarketBookDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly markets: (tx: Tx) => MarketRepository;
  readonly outcomes: (tx: Tx) => OutcomeRepository;
}

/**
 * Aggregate-liquidity-only market book (T-411). Phase 4 precedes bet placement
 * (Plan.md P4 excludes betting/matching), so no order can exist yet against any
 * market — every outcome's unmatched stake is correctly zero here. Phase 5's
 * order-book aggregation replaces the zero once bet placement exists, without
 * changing this shape or its no-counterparty-data guarantee.
 */
export class GetMarketBookUseCase<Tx> {
  constructor(private readonly deps: GetMarketBookDeps<Tx>) {}

  async execute(input: GetMarketBookInput): Promise<MarketBook> {
    return this.deps.uow.run(async (tx) => {
      const market = await this.deps.markets(tx).findById(input.marketId);
      if (!market) {
        throw new DomainError("RESOURCE_NOT_FOUND", "market not found", {
          details: { marketId: input.marketId },
        });
      }

      const outcomes = await this.deps.outcomes(tx).listByMarketId(input.marketId);
      return {
        marketId: market.id,
        status: market.status,
        outcomes: outcomes.map((outcome) => ({
          outcomeId: outcome.id,
          code: outcome.code,
          label: outcome.label,
          unmatchedStake: "0",
        })),
      };
    });
  }
}
