import { DomainError } from "@/domain/errors";
import { effectiveLimitValue, periodStart, type RollingLimitPeriod } from "@/domain/compliance";
import { exceedsCap } from "@/domain/money";
import type { Clock, LedgerWriter, RgLimitRepository } from "@/domain/ports";

export interface CheckStakeLimitsDeps<Tx> {
  readonly rgLimits: (tx: Tx, ownerId: string) => RgLimitRepository;
  readonly ledger: LedgerWriter<Tx>;
  readonly clock: Clock;
}

export interface CheckStakeLimitsInput {
  readonly userId: string;
  readonly currency: string;
  readonly requestedMinor: bigint;
}

function isRollingPeriod(
  period: "DAY" | "WEEK" | "MONTH" | "SESSION" | "PER_BET",
): period is RollingLimitPeriod {
  return period === "DAY" || period === "WEEK" || period === "MONTH";
}

/**
 * Enforces the caller's STAKE and SINGLE_BET responsible-gambling limits (RESPONSIBLE_GAMBLING.md
 * §2) against `requestedMinor`, evaluated against ledger-derived totals — never a cached counter
 * — so it must run inside the same transaction as the reservation it guards (T-809). Throws
 * `LIMIT_EXCEEDED` and posts nothing on violation; the caller places no partial bet.
 */
export async function assertWithinStakeLimits<Tx>(
  tx: Tx,
  deps: CheckStakeLimitsDeps<Tx>,
  input: CheckStakeLimitsInput,
): Promise<void> {
  const now = deps.clock.now();
  const stakeLimits = await deps.rgLimits(tx, input.userId).listByKind("STAKE");

  for (const limit of stakeLimits) {
    if (!isRollingPeriod(limit.period)) {
      continue;
    }
    const effective = effectiveLimitValue(limit, now);
    const since = periodStart(limit.period, now);
    const stakedInPeriod = await deps.ledger.sumEntriesSince(
      tx,
      `USER_LOCKED:${input.userId}`,
      input.currency,
      "RESERVE",
      since,
    );
    if (exceedsCap(stakedInPeriod, input.requestedMinor, effective)) {
      throw new DomainError("LIMIT_EXCEEDED", "stake limit would be exceeded", {
        details: {
          kind: "STAKE",
          period: limit.period,
          stakedInPeriodMinor: stakedInPeriod.toString(),
          requestedMinor: input.requestedMinor.toString(),
          limitMinor: effective.toString(),
          resetAt: new Date(
            since.getTime() + periodDurationMsUpperBound(limit.period),
          ).toISOString(),
        },
      });
    }
  }

  const singleBetLimits = await deps.rgLimits(tx, input.userId).listByKind("SINGLE_BET");
  for (const limit of singleBetLimits) {
    const effective = effectiveLimitValue(limit, now);
    if (input.requestedMinor > effective) {
      throw new DomainError("LIMIT_EXCEEDED", "single-bet limit would be exceeded", {
        details: {
          kind: "SINGLE_BET",
          requestedMinor: input.requestedMinor.toString(),
          limitMinor: effective.toString(),
        },
      });
    }
  }
}

/** An upper bound is sufficient here — `resetAt` is informational (UI copy), not enforced. */
function periodDurationMsUpperBound(period: RollingLimitPeriod): number {
  switch (period) {
    case "DAY":
      return 24 * 60 * 60 * 1_000;
    case "WEEK":
      return 7 * 24 * 60 * 60 * 1_000;
    case "MONTH":
      return 31 * 24 * 60 * 60 * 1_000;
  }
}
