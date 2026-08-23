import { DomainError } from "@/domain/errors";
import type { SessionRecord } from "@/domain/ports";

const MS_PER_MINUTE = 60_000;

/**
 * Admin catalog mutations require a session that has re-proven MFA recently
 * (T-412), not just an active session — this guards against a stolen/idle
 * admin session being enough to mutate the catalog on its own.
 */
export function requireStepUp(session: SessionRecord, now: Date, maxAgeMinutes: number): void {
  if (!session.mfaVerifiedAt) {
    throw new DomainError("MFA_REQUIRED", "this action requires a recent MFA re-verification");
  }

  const ageMs = now.getTime() - session.mfaVerifiedAt.getTime();
  if (ageMs > maxAgeMinutes * MS_PER_MINUTE) {
    throw new DomainError("MFA_REQUIRED", "MFA re-verification has expired, please verify again");
  }
}
