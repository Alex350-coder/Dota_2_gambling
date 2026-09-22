import type { UserRecord } from "@/domain/ports";

/** Never serializes `passwordHash`/`mfaSecretEnc` — admin views a user's status, not their secrets. */
export function serializeUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    dateOfBirth: user.dateOfBirth,
    emailVerifiedAt: user.emailVerifiedAt,
    revocableAt: user.revocableAt,
    mfaEnabled: user.mfaEnabledAt !== null,
    createdAt: user.createdAt,
  };
}
