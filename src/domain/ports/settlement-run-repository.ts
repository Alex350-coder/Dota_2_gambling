import type { SettlementRunStatus } from "../settlement/state";

export interface SettlementRun {
  readonly id: string;
  readonly marketId: string;
  readonly resultId: string;
  readonly status: SettlementRunStatus;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly allocationsTotal: number;
  readonly allocationsSettled: number;
  readonly payoutTotalMinor: bigint;
  readonly commissionTotalMinor: bigint;
  readonly refundTotalMinor: bigint;
}

export interface UpsertInProgressInput {
  readonly id: string;
  readonly marketId: string;
  readonly resultId: string;
  readonly startedAt: Date;
}

export interface SettlementRunProgress {
  readonly allocationsTotal?: number;
  readonly allocationsSettled?: number;
}

export interface SettlementRunCompletionTotals {
  readonly finishedAt: Date;
  readonly allocationsSettled: number;
  readonly payoutTotalMinor: bigint;
  readonly commissionTotalMinor: bigint;
  readonly refundTotalMinor: bigint;
}

/**
 * `settlement_runs` (`SETTLEMENT.md` §3): the resume-capable state machine that guarantees a
 * market is never settled twice (`one_completed_run_per_market` partial unique index, RULE-F12).
 * Unlike `market_results`, this is not append-only — a single row is reused across a
 * `FAILED -> IN_PROGRESS` retry, tracking progress in place, per the algorithm's own
 * `upsert settlement_runs (IN_PROGRESS)` step.
 */
export interface SettlementRunRepository {
  /** Most recent run for a market, if any — what every settle attempt reads first. */
  findByMarketId(marketId: string): Promise<SettlementRun | null>;
  findById(id: string): Promise<SettlementRun | null>;
  /**
   * Creates the market's first run `IN_PROGRESS`, or flips an existing `FAILED` run for the
   * same market back to `IN_PROGRESS` (`assertTransitionSettlementRun` still gates the latter
   * in the use case before this is called — this method performs the write, not the guard).
   */
  upsertInProgress(input: UpsertInProgressInput): Promise<SettlementRun>;
  updateProgress(id: string, progress: SettlementRunProgress): Promise<SettlementRun>;
  markCompleted(id: string, totals: SettlementRunCompletionTotals): Promise<SettlementRun>;
  markFailed(id: string, finishedAt: Date): Promise<SettlementRun>;
}
