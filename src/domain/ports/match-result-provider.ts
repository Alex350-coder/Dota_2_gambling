export type MatchResultTrustLevel = "SINGLE_SOURCE" | "MULTI_SOURCE";

export interface ExternalMatchResult {
  readonly marketId: string;
  readonly winningOutcomeId: string;
  readonly trustLevel: MatchResultTrustLevel;
}

export interface MatchResultProvider {
  fetchResult(marketId: string): Promise<ExternalMatchResult | null>;
}
