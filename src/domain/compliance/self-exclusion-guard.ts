import { DomainError } from "@/domain/errors";
import type { UserStatus } from "@/domain/ports";

/**
 * Guards every admin-driven status change against an irrevocable self-exclusion
 * (RESPONSIBLE_GAMBLING.md §3: "no admin may shorten it"). Intentionally broader than just
 * "raising" the status back to `ACTIVE` — no admin-driven status change of any kind is permitted
 * while the exclusion is still irrevocable.
 */
export function assertAdminCanChangeStatus(
  user: { readonly status: UserStatus; readonly revocableAt: Date | null },
  now: Date,
): void {
  if (user.status !== "SELF_EXCLUDED") {
    return;
  }
  if (user.revocableAt === null || user.revocableAt > now) {
    throw new DomainError(
      "UNAUTHORIZED_OPERATION",
      "self-exclusion is irrevocable before its revocable_at instant",
      { details: { revocableAt: user.revocableAt?.toISOString() ?? null } },
    );
  }
}
