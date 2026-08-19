export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly ipHash: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface CreateSessionInput {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly ipHash: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

/**
 * Not owner-scoped like WalletRepository — validating a session looks it up by
 * token hash before the caller's identity is known, and revoking every session
 * for a user (password reset, T-307) legitimately spans one user's rows across
 * the whole table. Same intentional divergence as UserRepository.
 */
export interface SessionRepository {
  create(input: CreateSessionInput): Promise<SessionRecord>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  touch(id: string, lastSeenAt: Date): Promise<void>;
  revoke(id: string, revokedAt: Date): Promise<void>;
}
