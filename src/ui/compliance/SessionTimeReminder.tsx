"use client";

import { useEffect, useState } from "react";

interface SessionTimeReminderProps {
  readonly sessionStartedAt: string;
  readonly intervalMinutes: number;
}

function elapsedMinutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}

/**
 * Unobtrusive elapsed-time indicator (T-813, RESPONSIBLE_GAMBLING.md §2 soft limit) — appears
 * once elapsed session time crosses each multiple of `intervalMinutes` and stays dismissed for
 * that milestone until the next one is reached. This is independent of the hard `SESSION_TIME`
 * RG limit (`LimitKind = "SESSION_TIME"`), which blocks play outright; this is a reminder only.
 */
export function SessionTimeReminder({
  sessionStartedAt,
  intervalMinutes,
}: SessionTimeReminderProps) {
  const [elapsedMinutes, setElapsedMinutes] = useState(() => elapsedMinutesSince(sessionStartedAt));
  const [dismissedMilestone, setDismissedMilestone] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsedMinutes(elapsedMinutesSince(sessionStartedAt));
    }, 60_000);
    return () => {
      clearInterval(id);
    };
  }, [sessionStartedAt]);

  const milestone = Math.floor(elapsedMinutes / intervalMinutes) * intervalMinutes;
  const visible = milestone > 0 && milestone !== dismissedMilestone;

  if (!visible) {
    return null;
  }

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-4 rounded border border-[var(--state-info)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--text-primary)]"
    >
      <span>You have been playing for about {elapsedMinutes} minutes this session.</span>
      <button
        type="button"
        onClick={() => {
          setDismissedMilestone(milestone);
        }}
        className="rounded text-[var(--text-secondary)] underline hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        Dismiss
      </button>
    </div>
  );
}
