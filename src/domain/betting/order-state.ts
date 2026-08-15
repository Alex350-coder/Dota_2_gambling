import { DomainError } from "../errors";
import type { BetOrderStatus } from "./order";
import type { Minor } from "../money/types";

export type BetOrderActor = "USER" | "ADMIN" | "SYSTEM";

/** Market statuses relevant to a BetOrder cancellation guard. See StateManagement.md §2/§3. */
export type RelevantMarketStatus =
  "DRAFT" | "OPEN" | "SUSPENDED" | "CLOSED" | "SETTLING" | "SETTLED" | "CANCELLED" | "VOID";

export interface BetOrderTransitionContext {
  readonly actor: BetOrderActor;
  readonly matchedMinor?: Minor;
  readonly unmatchedMinor?: Minor;
  readonly marketStatus?: RelevantMarketStatus;
}

type TransitionGuard = (ctx: BetOrderTransitionContext) => boolean;

function isSystem(ctx: BetOrderTransitionContext): boolean {
  return ctx.actor === "SYSTEM";
}

function isPartialFill(ctx: BetOrderTransitionContext): boolean {
  return (
    ctx.matchedMinor !== undefined &&
    ctx.unmatchedMinor !== undefined &&
    ctx.matchedMinor > 0n &&
    ctx.unmatchedMinor > 0n
  );
}

function isFullyMatched(ctx: BetOrderTransitionContext): boolean {
  return ctx.unmatchedMinor !== undefined && ctx.unmatchedMinor === 0n;
}

function canCancelViaMarket(ctx: BetOrderTransitionContext): boolean {
  return (
    (ctx.actor === "USER" || ctx.actor === "SYSTEM") &&
    (ctx.marketStatus === "OPEN" || ctx.marketStatus === "SUSPENDED")
  );
}

interface TransitionRule {
  readonly from: BetOrderStatus;
  readonly to: BetOrderStatus;
  readonly guard: TransitionGuard;
}

/** Single source of truth for BetOrder transitions (StateManagement.md §3, RULE-S01). */
const TRANSITION_RULES: readonly TransitionRule[] = [
  { from: "PENDING", to: "OPEN", guard: isSystem },
  { from: "PENDING", to: "REJECTED", guard: isSystem },
  { from: "OPEN", to: "OPEN", guard: (ctx) => isSystem(ctx) && isPartialFill(ctx) },
  { from: "OPEN", to: "MATCHED", guard: (ctx) => isSystem(ctx) && isFullyMatched(ctx) },
  { from: "OPEN", to: "CANCELLED", guard: canCancelViaMarket },
  { from: "MATCHED", to: "SETTLED", guard: isSystem },
  { from: "OPEN", to: "SETTLED", guard: isSystem },
  { from: "MATCHED", to: "VOIDED", guard: isSystem },
  { from: "OPEN", to: "VOIDED", guard: isSystem },
];

/** Anything not covered by `TRANSITION_RULES` is invalid (RULE-S02). */
export function canTransition(
  from: BetOrderStatus,
  to: BetOrderStatus,
  ctx: BetOrderTransitionContext,
): boolean {
  return TRANSITION_RULES.some((rule) => rule.from === from && rule.to === to && rule.guard(ctx));
}

export function assertTransition(
  from: BetOrderStatus,
  to: BetOrderStatus,
  ctx: BetOrderTransitionContext,
): void {
  if (!canTransition(from, to, ctx)) {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      `BetOrder transition ${from} -> ${to} is not allowed for actor ${ctx.actor}`,
      { details: { from, to, actor: ctx.actor } },
    );
  }
}
