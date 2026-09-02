import { DomainError } from "../errors";
import type { Minor } from "../money/types";

// --- MatchAllocation (StateManagement.md §4) ---------------------------------

export type MatchAllocationStatus = "ACTIVE" | "SETTLED" | "VOIDED";

export interface MatchAllocationTransitionContext {
  readonly actor: "SYSTEM";
}

interface Rule<TStatus extends string, TCtx> {
  readonly from: TStatus;
  readonly to: TStatus;
  readonly guard: (ctx: TCtx) => boolean;
}

const MATCH_ALLOCATION_RULES: readonly Rule<
  MatchAllocationStatus,
  MatchAllocationTransitionContext
>[] = [
  { from: "ACTIVE", to: "SETTLED", guard: () => true },
  { from: "ACTIVE", to: "VOIDED", guard: () => true },
];

/** Single source of truth for MatchAllocation transitions (RULE-S01). No column may change after insert otherwise. */
export function canTransitionMatchAllocation(
  from: MatchAllocationStatus,
  to: MatchAllocationStatus,
  ctx: MatchAllocationTransitionContext,
): boolean {
  return MATCH_ALLOCATION_RULES.some(
    (rule) => rule.from === from && rule.to === to && rule.guard(ctx),
  );
}

export function assertTransitionMatchAllocation(
  from: MatchAllocationStatus,
  to: MatchAllocationStatus,
  ctx: MatchAllocationTransitionContext,
): void {
  if (!canTransitionMatchAllocation(from, to, ctx)) {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      `MatchAllocation transition ${from} -> ${to} is not allowed`,
      { details: { from, to } },
    );
  }
}

// --- MarketResult (StateManagement.md §5) ------------------------------------

export type MarketResultStatus =
  "PENDING" | "PROPOSED" | "CONFIRMED" | "DISPUTED" | "SUPERSEDED" | "VOID_PROPOSED";

export interface MarketResultTransitionContext {
  readonly proposerId: string;
  readonly confirmerId?: string | undefined;
  readonly hasExistingConfirmedResult?: boolean | undefined;
}

function canConfirmResult(ctx: MarketResultTransitionContext): boolean {
  return (
    ctx.confirmerId !== undefined &&
    ctx.confirmerId !== ctx.proposerId &&
    ctx.hasExistingConfirmedResult !== true
  );
}

const MARKET_RESULT_RULES: readonly Rule<MarketResultStatus, MarketResultTransitionContext>[] = [
  { from: "PENDING", to: "PROPOSED", guard: () => true },
  { from: "PENDING", to: "VOID_PROPOSED", guard: () => true },
  { from: "PROPOSED", to: "CONFIRMED", guard: canConfirmResult },
  { from: "PROPOSED", to: "DISPUTED", guard: () => true },
  { from: "VOID_PROPOSED", to: "CONFIRMED", guard: canConfirmResult },
  { from: "VOID_PROPOSED", to: "DISPUTED", guard: () => true },
  { from: "CONFIRMED", to: "SUPERSEDED", guard: () => true },
  // Resolving a dispute never edits the disputed row (RESULT_PROVIDERS.md §5): it is marked
  // SUPERSEDED and a fresh PENDING row (pointing supersedesId back at it) starts the
  // propose/confirm lifecycle over.
  { from: "DISPUTED", to: "SUPERSEDED", guard: () => true },
];

/**
 * Single source of truth for a single MarketResult row's transitions
 * (RULE-S01). `PROPOSED -> DISPUTED` spawns a new `PENDING`/`PROPOSED` row
 * elsewhere; that row is a distinct aggregate, not a transition of this one.
 */
export function canTransitionMarketResult(
  from: MarketResultStatus,
  to: MarketResultStatus,
  ctx: MarketResultTransitionContext,
): boolean {
  return MARKET_RESULT_RULES.some(
    (rule) => rule.from === from && rule.to === to && rule.guard(ctx),
  );
}

export function assertTransitionMarketResult(
  from: MarketResultStatus,
  to: MarketResultStatus,
  ctx: MarketResultTransitionContext,
): void {
  if (!canTransitionMarketResult(from, to, ctx)) {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      `MarketResult transition ${from} -> ${to} is not allowed`,
      { details: { from, to } },
    );
  }
}

// --- SettlementRun (StateManagement.md §6) -----------------------------------

export type SettlementRunStatus = "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface SettlementRunTransitionContext {
  readonly marketEscrowMinor: Minor;
  readonly hasExistingCompletedRun: boolean;
}

function canCompleteSettlementRun(ctx: SettlementRunTransitionContext): boolean {
  return ctx.marketEscrowMinor === 0n && !ctx.hasExistingCompletedRun;
}

const SETTLEMENT_RUN_RULES: readonly Rule<SettlementRunStatus, SettlementRunTransitionContext>[] = [
  { from: "IN_PROGRESS", to: "COMPLETED", guard: canCompleteSettlementRun },
  { from: "IN_PROGRESS", to: "FAILED", guard: () => true },
  { from: "FAILED", to: "IN_PROGRESS", guard: () => true },
];

/** Single source of truth for SettlementRun transitions (RULE-S01). At most one COMPLETED per market. */
export function canTransitionSettlementRun(
  from: SettlementRunStatus,
  to: SettlementRunStatus,
  ctx: SettlementRunTransitionContext,
): boolean {
  return SETTLEMENT_RUN_RULES.some(
    (rule) => rule.from === from && rule.to === to && rule.guard(ctx),
  );
}

export function assertTransitionSettlementRun(
  from: SettlementRunStatus,
  to: SettlementRunStatus,
  ctx: SettlementRunTransitionContext,
): void {
  if (!canTransitionSettlementRun(from, to, ctx)) {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      `SettlementRun transition ${from} -> ${to} is not allowed`,
      { details: { from, to } },
    );
  }
}
