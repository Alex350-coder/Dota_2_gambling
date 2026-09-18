import { DomainError } from "@/domain/errors";
import type {
  AuditWriter,
  Clock,
  EmailVerificationTokenRepository,
  IdGenerator,
  MailProvider,
  UnitOfWork,
  UserRecord,
  UserRepository,
} from "@/domain/ports";
import { generateOpaqueToken, hashToken } from "@/platform/crypto";
import { profileEmailChangeRequestedEvent } from "@/application/audit/writer";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface UpdateProfileInput {
  readonly userId: string;
  readonly email: string;
}

export interface UpdateProfileDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
  readonly verificationTokens: (tx: Tx) => EmailVerificationTokenRepository;
  readonly mail: MailProvider<Tx>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

/**
 * A no-op email (same as the current one) is accepted and simply re-sends nothing — only an
 * actual change re-triggers verification, mirroring RegisterUseCase's token-issuance shape
 * (T-801, "email change re-verifies via the existing VerifyEmailUseCase token flow").
 */
export class UpdateProfileUseCase<Tx> {
  constructor(private readonly deps: UpdateProfileDeps<Tx>) {}

  async execute(input: UpdateProfileInput): Promise<UserRecord> {
    return this.deps.uow.run(async (tx) => {
      const users = this.deps.users(tx);
      const user = await users.findById(input.userId);
      if (!user) {
        throw new DomainError("RESOURCE_NOT_FOUND", "user not found", {
          details: { userId: input.userId },
        });
      }

      if (input.email === user.email) {
        return user;
      }

      const existing = await users.findByEmail(input.email);
      if (existing) {
        throw new DomainError("VALIDATION_FAILED", "email already registered", {
          details: { field: "email", reason: "EMAIL_ALREADY_REGISTERED" },
        });
      }

      const now = this.deps.clock.now();
      await users.updateEmail(input.userId, input.email, now);

      const token = generateOpaqueToken();
      await this.deps.verificationTokens(tx).create({
        id: this.deps.ids.next(),
        userId: input.userId,
        tokenHash: hashToken(token),
        createdAt: now,
        expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS),
      });

      await this.deps.mail.send(tx, {
        to: input.email,
        template: "verify-email",
        data: { token },
      });

      await this.deps.audit.record(tx, profileEmailChangeRequestedEvent(input.userId));

      const updated = await users.findById(input.userId);
      if (!updated) {
        throw new Error("user disappeared mid-transaction");
      }
      return updated;
    });
  }
}
