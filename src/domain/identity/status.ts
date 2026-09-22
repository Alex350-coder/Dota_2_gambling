import { DomainError } from "@/domain/errors";
import type { UserStatus } from "@/domain/ports";

/**
 * Guards order placement / deposits against blocked account states
 * (StateManagement.md §10). SELF_EXCLUDED gets its own error code because it is
 * user-initiated and only revocable after `revocable_at` (RESPONSIBLE_GAMBLING.md)
 * — callers must not treat it the same as an admin-imposed SUSPENDED/CLOSED.
 */
export function assertActiveAccount(status: UserStatus): void {
  switch (status) {
    case "ACTIVE":
      return;
    case "SELF_EXCLUDED":
      throw new DomainError("ACCOUNT_SELF_EXCLUDED", "account is self-excluded");
    case "SUSPENDED":
    case "CLOSED":
      throw new DomainError("ACCOUNT_SUSPENDED", `account is ${status.toLowerCase()}`);
    case "PENDING_VERIFICATION":
      throw new DomainError("UNAUTHORIZED_OPERATION", "account email is not yet verified");
  }
}

/** The only two transitions an admin may drive directly (T-903); SELF_EXCLUDED has its own
 * revocable_at mechanism (RESPONSIBLE_GAMBLING.md) and is never admin-restored through this
 * guard, and CLOSED is terminal. */
export type AdminUserStatusTransition = "SUSPENDED" | "ACTIVE";

/**
 * Admin suspend/restore transitions (T-903, RULE-S02: invalid transitions throw
 * INVALID_STATE_TRANSITION and never mutate). Suspend is allowed from any non-terminal,
 * non-already-suspended state (ADMIN may need to suspend a still-unverified or
 * self-excluded account for abuse reasons); restore only reverses a SUSPENDED account back to
 * ACTIVE — it is not a way to lift self-exclusion or reopen a closed account.
 */
export function assertUserStatusTransition(
  current: UserStatus,
  target: AdminUserStatusTransition,
): void {
  const allowed =
    target === "SUSPENDED"
      ? current !== "SUSPENDED" && current !== "CLOSED"
      : current === "SUSPENDED";

  if (!allowed) {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      `user status transition ${current} -> ${target} is not allowed`,
      { details: { from: current, to: target } },
    );
  }
}
