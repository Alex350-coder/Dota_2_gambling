export type UserStatus =
  "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "CLOSED" | "SELF_EXCLUDED";

export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string | null;
  readonly status: UserStatus;
  readonly dateOfBirth: string;
  readonly emailVerifiedAt: Date | null;
  /** Set when `status = SELF_EXCLUDED`; `null` means permanent (never automatically revocable). */
  readonly revocableAt: Date | null;
  readonly mfaSecretEnc: string | null;
  readonly mfaEnabledAt: Date | null;
  readonly createdAt: Date;
}

export interface CreateUserInput {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly dateOfBirth: string;
}

/**
 * Not owner-scoped like WalletRepository — identity lookups (registration, login)
 * legitimately need to find a user by email across the whole table, not within one
 * owner's data. Isolation for per-user data (sessions, tokens) lives on those ports.
 */
export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
  activate(userId: string, verifiedAt: Date): Promise<void>;
  /** Sets the new email and clears `emailVerifiedAt` — the caller must re-verify (T-801). */
  updateEmail(userId: string, email: string, updatedAt: Date): Promise<void>;
  updatePasswordHash(userId: string, passwordHash: string, updatedAt: Date): Promise<void>;
  setMfaSecret(userId: string, mfaSecretEnc: string, updatedAt: Date): Promise<void>;
  activateMfa(userId: string, enabledAt: Date): Promise<void>;
  disableMfa(userId: string, updatedAt: Date): Promise<void>;
  setSelfExcluded(userId: string, revocableAt: Date | null, updatedAt: Date): Promise<void>;
  updateStatus(userId: string, status: UserStatus, updatedAt: Date): Promise<void>;
}
