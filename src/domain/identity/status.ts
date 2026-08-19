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
