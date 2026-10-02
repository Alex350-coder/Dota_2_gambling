import { DomainError } from "@/domain/errors";
import type {
  BookRepository,
  MarketRepository,
  OutcomeRepository,
  UnitOfWork,
} from "@/domain/ports";

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
  readonly book: (tx: Tx) => BookRepository;
}

/**
 * Aggregate-liquidity-only market book (T-411). Per-outcome unmatched stake is a real
 * aggregate over open orders (`BookRepository.sumUnmatchedByOutcome`) — no counterparty,
 * order, or user data is exposed (RULE-E02), only a liquidity total per outcome.
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
      const unmatchedByOutcome = await this.deps.book(tx).sumUnmatchedByOutcome(input.marketId);
      return {
        marketId: market.id,
        status: market.status,
        outcomes: outcomes.map((outcome) => ({
          outcomeId: outcome.id,
          code: outcome.code,
          label: outcome.label,
          unmatchedStake: (unmatchedByOutcome.get(outcome.id) ?? 0n).toString(),
        })),
      };
    });
  }
}
