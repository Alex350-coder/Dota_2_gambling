import { DomainError } from "@/domain/errors";

/**
 * Responsible-gambling limit kinds (RESPONSIBLE_GAMBLING.md §2). `value` is
 * minor currency units for DEPOSIT/STAKE/LOSS/SINGLE_BET and whole minutes
 * for SESSION_TIME — never a float in either case.
 */
export type LimitKind = "DEPOSIT" | "STAKE" | "LOSS" | "SESSION_TIME" | "SINGLE_BET";

export type LimitPeriod = "DAY" | "WEEK" | "MONTH" | "SESSION" | "PER_BET";

const VALID_PERIODS_BY_KIND: Readonly<Record<LimitKind, readonly LimitPeriod[]>> = {
  DEPOSIT: ["DAY", "WEEK", "MONTH"],
  STAKE: ["DAY", "WEEK", "MONTH"],
  LOSS: ["DAY", "WEEK", "MONTH"],
  SESSION_TIME: ["SESSION"],
  SINGLE_BET: ["PER_BET"],
};

export function assertValidLimitPeriod(kind: LimitKind, period: LimitPeriod): void {
  if (!VALID_PERIODS_BY_KIND[kind].includes(period)) {
    throw new DomainError(
      "VALIDATION_FAILED",
      `${period} is not a valid period for limit kind ${kind}`,
      {
        details: { field: "period", kind, period },
      },
    );
  }
}

/** The 24h cooling-off period for raising a limit (RULE-K07). */
export const LIMIT_RAISE_COOLING_OFF_MS = 24 * 60 * 60 * 1_000;

export interface RgLimitState {
  readonly kind: LimitKind;
  readonly period: LimitPeriod;
  /** The value currently in force, ignoring any not-yet-effective pending change. */
  readonly currentValue: bigint;
  /** A raise awaiting its cooling-off period; `null` when there is no pending change. */
  readonly pendingValue: bigint | null;
  /** When `pendingValue` becomes the current value; `null` when there is no pending change. */
  readonly effectiveAt: Date | null;
}

export interface LimitChangeResult {
  readonly currentValue: bigint;
  readonly pendingValue: bigint | null;
  readonly effectiveAt: Date | null;
}

/**
 * The value actually enforced right now. Per RULE-K07 this is always
 * `min(current, pending-not-yet-effective)`: a lowered limit is never
 * bypassed by a still-cooling-off raise, and once `effectiveAt` passes the
 * pending value becomes authoritative on its own (the caller is expected to
 * persist that transition; this function only computes the read-time value).
 */
export function effectiveLimitValue(limit: RgLimitState, now: Date): bigint {
  if (limit.pendingValue === null || limit.effectiveAt === null) {
    return limit.currentValue;
  }
  if (now.getTime() >= limit.effectiveAt.getTime()) {
    return limit.pendingValue;
  }
  return limit.pendingValue < limit.currentValue ? limit.pendingValue : limit.currentValue;
}

/**
 * Computes the new persisted state for a user-requested limit change.
 * Lowering (or keeping equal) applies immediately and clears any pending
 * raise. Raising above the currently effective value is deferred: it is
 * stored as `pendingValue` with `effectiveAt` 24h out, and
 * `effectiveLimitValue` keeps enforcing the lower value until then.
 */
export function applyLimitChange(
  limit: RgLimitState,
  newValue: bigint,
  now: Date,
): LimitChangeResult {
  if (newValue < 0n) {
    throw new DomainError("VALIDATION_FAILED", "limit value must not be negative", {
      details: { field: "value" },
    });
  }

  const effectiveNow = effectiveLimitValue(limit, now);

  if (newValue <= effectiveNow) {
    return { currentValue: newValue, pendingValue: null, effectiveAt: null };
  }

  return {
    currentValue: effectiveNow,
    pendingValue: newValue,
    effectiveAt: new Date(now.getTime() + LIMIT_RAISE_COOLING_OFF_MS),
  };
}

/**
 * Default limits assigned to every new account (RESPONSIBLE_GAMBLING.md §2:
 * "Defaults exist for every new account; the user can tighten them at any
 * time."). Values are deliberately generous placeholders for a simulated-
 * money MVP, not a regulator-mandated figure.
 */
export const DEFAULT_LIMITS: readonly { kind: LimitKind; period: LimitPeriod; value: bigint }[] = [
  { kind: "DEPOSIT", period: "DAY", value: 100_000n },
  { kind: "STAKE", period: "DAY", value: 100_000n },
  { kind: "LOSS", period: "DAY", value: 100_000n },
  { kind: "SESSION_TIME", period: "SESSION", value: 180n },
  { kind: "SINGLE_BET", period: "PER_BET", value: 50_000n },
];

export type SelfExclusionPeriod = "24H" | "7D" | "30D" | "6M" | "PERMANENT";

const SELF_EXCLUSION_DURATION_MS: Readonly<
  Record<Exclude<SelfExclusionPeriod, "PERMANENT">, number>
> = {
  "24H": 24 * 60 * 60 * 1_000,
  "7D": 7 * 24 * 60 * 60 * 1_000,
  "30D": 30 * 24 * 60 * 60 * 1_000,
  "6M": 182 * 24 * 60 * 60 * 1_000,
};

/**
 * `null` means permanent — never revocable (RESPONSIBLE_GAMBLING.md §3).
 */
export function selfExclusionRevocableAt(period: SelfExclusionPeriod, now: Date): Date | null {
  if (period === "PERMANENT") {
    return null;
  }
  return new Date(now.getTime() + SELF_EXCLUSION_DURATION_MS[period]);
}
