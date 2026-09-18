export interface SessionSpan {
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
}

/**
 * Minutes of site activity across `sessions`, clipped to `[since, until]` (RESPONSIBLE_GAMBLING.md
 * §4: "time on site ... computed from the ledger, never from a cached figure"). Each session
 * contributes its `[createdAt, lastSeenAt]` overlap with the window, floored at zero so a session
 * that never overlaps the window contributes nothing.
 */
export function sumSessionMinutes(
  sessions: readonly SessionSpan[],
  since: Date,
  until: Date,
): number {
  let totalMs = 0;
  for (const session of sessions) {
    const start = Math.max(session.createdAt.getTime(), since.getTime());
    const end = Math.min(session.lastSeenAt.getTime(), until.getTime());
    if (end > start) {
      totalMs += end - start;
    }
  }
  return Math.floor(totalMs / 60_000);
}
