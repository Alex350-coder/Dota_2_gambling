import { DomainError } from "@/domain/errors";
import type {
  Clock,
  EmailVerificationTokenRepository,
  UnitOfWork,
  UserRepository,
} from "@/domain/ports";
import { hashToken } from "@/platform/crypto";

export interface VerifyEmailInput {
  readonly token: string;
}

export interface VerifyEmailDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
  readonly verificationTokens: (tx: Tx) => EmailVerificationTokenRepository;
  readonly clock: Clock;
}

export class VerifyEmailUseCase<Tx> {
  constructor(private readonly deps: VerifyEmailDeps<Tx>) {}

  async execute(input: VerifyEmailInput): Promise<void> {
    const tokenHash = hashToken(input.token);

    await this.deps.uow.run(async (tx) => {
      const tokens = this.deps.verificationTokens(tx);
      const record = await tokens.findByTokenHash(tokenHash);
      const now = this.deps.clock.now();

      const isUsedOrExpired =
        record !== null && (record.usedAt !== null || record.expiresAt.getTime() < now.getTime());
      if (!record || isUsedOrExpired) {
        throw new DomainError("VALIDATION_FAILED", "verification token is invalid or expired", {
          details: { field: "token" },
        });
      }

      await tokens.markUsed(record.id, now);
      await this.deps.users(tx).activate(record.userId, now);
    });
  }
}
