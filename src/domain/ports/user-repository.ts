export type UserStatus =
  "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "CLOSED" | "SELF_EXCLUDED";

export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string | null;
  readonly status: UserStatus;
  readonly dateOfBirth: string;
  readonly emailVerifiedAt: Date | null;
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
}
