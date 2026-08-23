import { describe, expect, it } from "vitest";
import { requireStepUp } from "./require-step-up";
import { DomainError } from "@/domain/errors";
import type { SessionRecord } from "@/domain/ports";

function buildSession(mfaVerifiedAt: Date | null): SessionRecord {
  return {
    id: "session-1",
    userId: "user-1",
    tokenHash: "hash",
    ipHash: null,
    userAgent: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    lastSeenAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: new Date("2026-01-02T00:00:00Z"),
    revokedAt: null,
    mfaVerifiedAt,
  };
}

describe("requireStepUp", () => {
  const now = new Date("2026-01-01T00:10:00Z");

  it("throws MFA_REQUIRED when the session never re-proved MFA", () => {
    expect(() => {
      requireStepUp(buildSession(null), now, 15);
    }).toThrow(DomainError);
  });

  it("throws MFA_REQUIRED when the last verification is older than the freshness window", () => {
    const session = buildSession(new Date("2026-01-01T00:00:00Z"));
    // 10 minutes have passed but the window is only 5 minutes.
    expect(() => {
      requireStepUp(session, now, 5);
    }).toThrow(DomainError);
  });

  it("does not throw when the session re-proved MFA within the freshness window", () => {
    const session = buildSession(new Date("2026-01-01T00:05:00Z"));
    expect(() => {
      requireStepUp(session, now, 15);
    }).not.toThrow();
  });
});
