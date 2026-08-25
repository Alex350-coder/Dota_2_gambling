import { DomainError } from "@/domain/errors";

/**
 * R-01: a user may never be matched against their own resting order. Structurally enforced
 * by the book query's `user_id <> $ownerId` filter — kept here too as a defense-in-depth
 * regression guard for any future caller that builds a resting-order list another way.
 */
export function assertNotSelfMatch(incomingUserId: string, restingUserId: string): void {
  if (incomingUserId === restingUserId) {
    throw new DomainError(
      "SELF_MATCH_FORBIDDEN",
      "an order cannot be matched against another order from the same user",
      { details: { userId: incomingUserId } },
    );
  }
}

/**
 * R-02: a streamer may not place a bet on a market they run — they set/see the odds and take
 * a commission on it, so betting on it themselves would be a conflict of interest.
 */
export function assertNotPrivilegedActor(userId: string, marketStreamerUserId: string): void {
  if (userId === marketStreamerUserId) {
    throw new DomainError(
      "UNAUTHORIZED_OPERATION",
      "a streamer cannot place a bet on a market they run",
      { details: { userId } },
    );
  }
}
