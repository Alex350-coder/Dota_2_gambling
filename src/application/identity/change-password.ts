import { isBreachedPassword } from "@/domain/identity";
import { DomainError } from "@/domain/errors";
import type {
  AuditWriter,
  Clock,
  PasswordHasher,
  SessionRepository,
  UnitOfWork,
  UserRepository,
} from "@/domain/ports";
import { passwordChangedEvent } from "@/application/audit/writer";

export interface ChangePasswordInput {
  readonly userId: string;
  readonly currentPassword: string;
  readonly newPassword: string;
  /** The session making the request — kept alive while every other session is revoked. */
  readonly exceptSessionId: string;
}

export interface ChangePasswordDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
  readonly sessions: (tx: Tx) => SessionRepository;
  readonly passwordHasher: PasswordHasher;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

/**
 * Distinct from ResetPasswordUseCase (token-based, unauthenticated flow) — this is the
 * authenticated in-account change, so re-auth means re-proving the *current* password
 * (same step-up concept DisableMfaUseCase already uses) rather than a mailed token (T-802).
 * Revokes every other session on success (Security.md §5), same as a reset.
 */
export class ChangePasswordUseCase<Tx> {
  constructor(private readonly deps: ChangePasswordDeps<Tx>) {}

  async execute(input: ChangePasswordInput): Promise<void> {
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

    await this.deps.uow.run(async (tx) => {
      const users = this.deps.users(tx);
      const user = await users.findById(input.userId);

      const passwordMatches =
        user?.passwordHash != null &&
        (await this.deps.passwordHasher.verify(user.passwordHash, input.currentPassword));
      if (!passwordMatches) {
        throw new DomainError("UNAUTHENTICATED", "password re-verification failed");
      }

      const now = this.deps.clock.now();
      const passwordHash = await this.deps.passwordHasher.hash(input.newPassword);
      await users.updatePasswordHash(input.userId, passwordHash, now);
      await this.deps.sessions(tx).revokeAllForUser(input.userId, now, input.exceptSessionId);
      await this.deps.audit.record(tx, passwordChangedEvent(input.userId));
    });
  }
}
