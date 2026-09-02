/** See Claude/domain/RESULT_PROVIDERS.md §4 — verification policy per trust level. */
export type MatchResultTrustLevel = "UNVERIFIED" | "SINGLE_SOURCE" | "CORROBORATED" | "OFFICIAL";

/** What a provider needs to look a result up — the market plus the match it settles. */
export interface MatchRef {
  readonly marketId: string;
  readonly matchId: string;
}

/**
 * A provider's verbatim answer, not yet a `market_results` row. `winningOutcomeId` is
 * `null` for a void/no-winner payload (e.g. the match was abandoned); the caller decides
 * whether that means `VOID_PROPOSED` or a rejected fetch.
 */
export interface RawMatchResult {
  readonly winningOutcomeId: string | null;
  readonly rawPayload: Record<string, unknown>;
}

/**
 * Result ingestion is pluggable so a rogue/compromised single source can never move money
 * unilaterally (RESULT_PROVIDERS.md §1). Adapters live in `src/infra/results/**`; the domain
 * layer only depends on this port (RULE-A02).
 */
export interface MatchResultProvider {
  /** `'MANUAL_ADMIN' | 'OPENDOTA' | 'PANDASCORE' | ...` — stored verbatim as `market_results.provider_key`. */
  readonly key: string;
  readonly trustLevel: MatchResultTrustLevel;
  fetchResult(ref: MatchRef): Promise<RawMatchResult | null>;
  /** Whether this provider can resolve results for the given `market_types.code`. */
  supports(marketTypeKey: string): boolean;
}
