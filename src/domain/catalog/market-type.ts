import { DomainError } from "../errors";

/**
 * A market type's economic shape. Only `BINARY` (exactly two outcomes) is
 * supported by the fixed 1.8x/20% economic model (Plan.md P4, MARKET_MODEL.md
 * §1) — `N_ARY` is modeled here so the registry stays honest about what a
 * market type *is*, but every non-binary type is rejected before it can be
 * attached to a market (T-404).
 */
export type OutcomeCardinality = "BINARY" | "N_ARY";

export interface MarketType {
  readonly code: string;
  readonly name: string;
  readonly outcomeCardinality: OutcomeCardinality;
}

/**
 * The only market type implemented end-to-end in the MVP. `market_types.code`
 * is game-agnostic — every game reuses the same "who won the match" market.
 */
export const MATCH_WINNER: MarketType = {
  code: "MATCH_WINNER",
  name: "Match Winner",
  outcomeCardinality: "BINARY",
};

export const BUILT_IN_MARKET_TYPES: readonly MarketType[] = [MATCH_WINNER];

/**
 * Throws `UNSUPPORTED_MARKET_MODEL` for any market type whose economic shape
 * the fixed 1.8x payout / 20% streamer commission model cannot represent.
 * Every market-creating use case must call this before persisting a market.
 */
export function assertSupportedByEconomicModel(marketType: MarketType): void {
  if (marketType.outcomeCardinality !== "BINARY") {
    throw new DomainError(
      "UNSUPPORTED_MARKET_MODEL",
      "only binary (two-outcome) market types are supported by the fixed economic model",
      { details: { code: marketType.code, outcomeCardinality: marketType.outcomeCardinality } },
    );
  }
}
