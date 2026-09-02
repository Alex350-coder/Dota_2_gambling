import type { MarketResultStatus } from "../settlement/state";
import type { MatchResultTrustLevel } from "./match-result-provider";

export interface MarketResult {
  readonly id: string;
  readonly marketId: string;
  readonly providerKey: string;
  readonly trustLevel: MatchResultTrustLevel;
  readonly winningOutcomeId: string | null;
  readonly rawPayload: Record<string, unknown>;
  readonly payloadHash: string;
  readonly status: MarketResultStatus;
  readonly proposedBy: string | null;
  readonly confirmedBy: string | null;
  readonly supersedesId: string | null;
  readonly createdAt: Date;
  readonly confirmedAt: Date | null;
}

export interface CreateMarketResultInput {
  readonly id: string;
  readonly marketId: string;
  readonly providerKey: string;
  readonly trustLevel: MatchResultTrustLevel;
  readonly winningOutcomeId: string | null;
  readonly rawPayload: Record<string, unknown>;
  readonly payloadHash: string;
  readonly status: MarketResultStatus;
  readonly proposedBy: string | null;
  readonly supersedesId?: string | null;
  readonly createdAt: Date;
}

/**
 * `market_results` rows are append-only history (RESULT_PROVIDERS.md §5): a correction never
 * rewrites a prior row, it inserts a new one and points `supersedesId` back at what it replaces.
 * The only in-place mutation a single row ever undergoes is its own `status`/`confirmedBy`/
 * `confirmedAt` columns advancing through `canTransitionMarketResult` (PENDING -> PROPOSED ->
 * CONFIRMED, etc.) — never its `winningOutcomeId`/`rawPayload`/`payloadHash`.
 */
export interface MarketResultRepository {
  create(input: CreateMarketResultInput): Promise<MarketResult>;
  findById(id: string): Promise<MarketResult | null>;
  /** Most recent non-`SUPERSEDED` row for a market — the row every propose/confirm/dispute acts on. */
  findCurrentByMarketId(marketId: string): Promise<MarketResult | null>;
  /** The `CONFIRMED` row for a market, if any — what settlement reads (`RESULT_NOT_CONFIRMED` otherwise). */
  findConfirmedByMarketId(marketId: string): Promise<MarketResult | null>;
  updateStatus(
    id: string,
    status: MarketResultStatus,
    fields?: { readonly confirmedBy?: string; readonly confirmedAt?: Date },
  ): Promise<MarketResult>;
}
