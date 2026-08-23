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
  readonly mfaVerifiedAt: Date | null;
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
  findById(id: string): Promise<SessionRecord | null>;
  listActiveByUserId(userId: string, now: Date): Promise<readonly SessionRecord[]>;
  touch(id: string, lastSeenAt: Date): Promise<void>;
  revoke(id: string, revokedAt: Date): Promise<void>;
  /** Records a fresh MFA re-verification on this session (T-412 step-up auth). */
  markMfaVerified(id: string, mfaVerifiedAt: Date): Promise<void>;
  /**
   * Revokes every non-revoked session for a user (password reset/change,
   * Security.md §5). `exceptSessionId` lets a caller keep its own session alive
   * when revoking the rest (not used by T-307, which revokes all of them).
   */
  revokeAllForUser(userId: string, revokedAt: Date, exceptSessionId?: string): Promise<void>;
}
