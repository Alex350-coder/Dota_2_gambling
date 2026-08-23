import { DomainError } from "../errors";
import type { Minor } from "../money/types";

export type MarketStatus =
  "DRAFT" | "OPEN" | "SUSPENDED" | "CLOSED" | "SETTLING" | "SETTLED" | "CANCELLED" | "VOID";

export type MarketActor = "ADMIN" | "SYSTEM";

export interface MarketTransitionContext {
  readonly actor: MarketActor;
  readonly now?: Date;
  readonly closesAt?: Date;
  readonly outcomeCount?: number;
  readonly economicProfileSet?: boolean;
  readonly hasOrders?: boolean;
  readonly manualClose?: boolean;
  readonly matchPlayed?: boolean;
  readonly hasConfirmedResult?: boolean;
  readonly settlementRunCompleted?: boolean;
  readonly marketEscrowMinor?: Minor;
  readonly settlementFailed?: boolean;
  readonly resultDisputed?: boolean;
}

type TransitionGuard = (ctx: MarketTransitionContext) => boolean;

function isAdmin(ctx: MarketTransitionContext): boolean {
  return ctx.actor === "ADMIN";
}

/** `MarketActor` is only ever `ADMIN` or `SYSTEM`, so this guard is unconditional. */
const isAdminOrSystem: TransitionGuard = () => true;

function isPastClosesAt(ctx: MarketTransitionContext): boolean {
  return ctx.now !== undefined && ctx.closesAt !== undefined && ctx.now >= ctx.closesAt;
}

function canOpenFromDraft(ctx: MarketTransitionContext): boolean {
  return (
    isAdmin(ctx) &&
    ctx.outcomeCount !== undefined &&
    ctx.outcomeCount >= 2 &&
    ctx.economicProfileSet === true &&
    ctx.now !== undefined &&
    ctx.closesAt !== undefined &&
    ctx.closesAt > ctx.now
  );
}

function canCancelDraft(ctx: MarketTransitionContext): boolean {
  return isAdmin(ctx) && ctx.hasOrders === false;
}

function canCloseFromOpen(ctx: MarketTransitionContext): boolean {
  return isAdminOrSystem(ctx) && (isPastClosesAt(ctx) || ctx.manualClose === true);
}

function canReopenFromSuspended(ctx: MarketTransitionContext): boolean {
  return isAdmin(ctx) && !isPastClosesAt(ctx);
}

function canVoidUnplayedMatch(ctx: MarketTransitionContext): boolean {
  return isAdmin(ctx) && ctx.matchPlayed === false;
}

function canSettleFromClosed(ctx: MarketTransitionContext): boolean {
  return ctx.actor === "SYSTEM" && ctx.hasConfirmedResult === true;
}

function canCompleteSettlement(ctx: MarketTransitionContext): boolean {
  return (
    ctx.actor === "SYSTEM" &&
    ctx.settlementRunCompleted === true &&
    ctx.marketEscrowMinor !== undefined &&
    ctx.marketEscrowMinor === 0n
  );
}

function canReturnToClosedFromSettling(ctx: MarketTransitionContext): boolean {
  return ctx.actor === "SYSTEM" && (ctx.settlementFailed === true || ctx.resultDisputed === true);
}

interface TransitionRule {
  readonly from: MarketStatus;
  readonly to: MarketStatus;
  readonly guard: TransitionGuard;
}

/** Single source of truth for Market transitions (StateManagement.md §2, RULE-S01). */
const TRANSITION_RULES: readonly TransitionRule[] = [
  { from: "DRAFT", to: "OPEN", guard: canOpenFromDraft },
  { from: "DRAFT", to: "CANCELLED", guard: canCancelDraft },
  { from: "OPEN", to: "SUSPENDED", guard: isAdminOrSystem },
  { from: "OPEN", to: "CLOSED", guard: canCloseFromOpen },
  { from: "SUSPENDED", to: "OPEN", guard: canReopenFromSuspended },
  { from: "SUSPENDED", to: "CLOSED", guard: isAdminOrSystem },
  { from: "SUSPENDED", to: "VOID", guard: canVoidUnplayedMatch },
  { from: "CLOSED", to: "SETTLING", guard: canSettleFromClosed },
  { from: "CLOSED", to: "VOID", guard: canVoidUnplayedMatch },
  { from: "SETTLING", to: "SETTLED", guard: canCompleteSettlement },
  { from: "SETTLING", to: "CLOSED", guard: canReturnToClosedFromSettling },
];

/** Anything not covered by `TRANSITION_RULES` is invalid (RULE-S02), including `VOID -> SETTLED`. */
export function canTransition(
  from: MarketStatus,
  to: MarketStatus,
  ctx: MarketTransitionContext,
): boolean {
  return TRANSITION_RULES.some((rule) => rule.from === from && rule.to === to && rule.guard(ctx));
}

export function assertTransition(
  from: MarketStatus,
  to: MarketStatus,
  ctx: MarketTransitionContext,
): void {
  if (!canTransition(from, to, ctx)) {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      `Market transition ${from} -> ${to} is not allowed for actor ${ctx.actor}`,
      { details: { from, to, actor: ctx.actor } },
    );
  }
}

/**
 * Pure guard for Phase 5 order placement to consume — a market only accepts
 * new orders while `OPEN` and strictly before `closesAt`. Kept here (not in
 * `src/application/betting/**`, which doesn't have a placement use case yet)
 * so Phase 5 can import it without Phase 4 reaching into betting internals.
 */
export function assertMarketAcceptingOrders(
  market: { readonly status: MarketStatus; readonly closesAt: Date },
  now: Date,
): void {
  if (market.status === "SUSPENDED") {
    throw new DomainError("MARKET_SUSPENDED", "market is suspended and not accepting orders", {
      details: { status: market.status },
    });
  }
  if (market.status !== "OPEN" || now >= market.closesAt) {
    throw new DomainError("MARKET_CLOSED", "market is not open for orders", {
      details: { status: market.status, closesAt: market.closesAt },
    });
  }
}
