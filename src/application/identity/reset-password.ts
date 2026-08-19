import { isBreachedPassword } from "@/domain/identity";
import { DomainError } from "@/domain/errors";
import type {
  Clock,
  PasswordHasher,
  PasswordResetTokenRepository,
  SessionRepository,
  UnitOfWork,
  UserRepository,
} from "@/domain/ports";
import { hashToken } from "@/platform/crypto";

export interface ResetPasswordInput {
  readonly token: string;
  readonly newPassword: string;
}

export interface ResetPasswordDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
  readonly resetTokens: (tx: Tx) => PasswordResetTokenRepository;
  readonly sessions: (tx: Tx) => SessionRepository;
  readonly passwordHasher: PasswordHasher;
  readonly clock: Clock;
}

/**
 * Consumes a single-use password reset token and, on success, revokes every
 * session for the account (Security.md §5: "password change/reset revokes all
 * sessions") — there is no exceptSessionId here because a password reset never
 * happens from an already-authenticated session.
 */
export class ResetPasswordUseCase<Tx> {
  constructor(private readonly deps: ResetPasswordDeps<Tx>) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    if (input.newPassword.length < 12 || input.newPassword.length > 128) {
      throw new DomainError("VALIDATION_FAILED", "password must be between 12 and 128 characters", {
        details: { field: "newPassword" },
      });
    }
    if (isBreachedPassword(input.newPassword)) {
      throw new DomainError("VALIDATION_FAILED", "password appears in a known breach list", {
        details: { field: "newPassword", reason: "BREACHED_PASSWORD" },
      });
    }

    const passwordHash = await this.deps.passwordHasher.hash(input.newPassword);
    const tokenHash = hashToken(input.token);

    await this.deps.uow.run(async (tx) => {
      const resetTokens = this.deps.resetTokens(tx);
      const record = await resetTokens.findByTokenHash(tokenHash);
      const now = this.deps.clock.now();

      const isUsedOrExpired =
        record !== null && (record.usedAt !== null || record.expiresAt.getTime() < now.getTime());
      if (!record || isUsedOrExpired) {
        throw new DomainError("VALIDATION_FAILED", "reset token is invalid or expired", {
          details: { field: "token" },
        });
      }

      await resetTokens.markUsed(record.id, now);
      await this.deps.users(tx).updatePasswordHash(record.userId, passwordHash, now);
      await this.deps.sessions(tx).revokeAllForUser(record.userId, now);
    });
  }
}
