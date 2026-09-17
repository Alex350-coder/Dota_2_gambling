/**
 * UTC period boundaries for the ledger-derived-sum limit kinds (DEPOSIT/STAKE/LOSS —
 * RESPONSIBLE_GAMBLING.md §2). `SESSION`/`PER_BET` have no rolling window: a session limit is
 * compared against elapsed session time directly, and a per-bet limit against the single
 * request, so neither calls this.
 */
export type RollingLimitPeriod = "DAY" | "WEEK" | "MONTH";

/** Monday 00:00:00 UTC of `now`'s ISO week. */
function startOfUtcWeek(now: Date): Date {
  const utcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = new Date(utcDay);
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - daysSinceMonday);
  return day;
}

export function periodStart(period: RollingLimitPeriod, now: Date): Date {
  switch (period) {
    case "DAY":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    case "WEEK":
      return startOfUtcWeek(now);
    case "MONTH":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
}
