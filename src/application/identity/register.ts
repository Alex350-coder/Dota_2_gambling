import { isAdult, isBreachedPassword } from "@/domain/identity";
import { DomainError } from "@/domain/errors";
import type {
  AuditWriter,
  Clock,
  EmailVerificationTokenRepository,
  IdGenerator,
  MailProvider,
  PasswordHasher,
  UnitOfWork,
  UserRepository,
} from "@/domain/ports";
import { generateOpaqueToken, hashToken } from "@/platform/crypto";
import { userRegisteredEvent } from "@/application/audit/writer";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly dateOfBirth: string;
}

export interface RegisterResult {
  readonly userId: string;
}

export interface RegisterDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
  readonly verificationTokens: (tx: Tx) => EmailVerificationTokenRepository;
  readonly passwordHasher: PasswordHasher;
  readonly mail: MailProvider<Tx>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

export class RegisterUseCase<Tx> {
  constructor(private readonly deps: RegisterDeps<Tx>) {}

  async execute(input: RegisterInput): Promise<RegisterResult> {
    if (!isAdult(input.dateOfBirth, this.deps.clock.now())) {
      throw new DomainError("AGE_REQUIREMENT_NOT_MET", "must be at least 18 years old");
    }

    if (input.password.length < 12 || input.password.length > 128) {
      throw new DomainError("VALIDATION_FAILED", "password must be between 12 and 128 characters", {
        details: { field: "password" },
      });
    }

    if (isBreachedPassword(input.password)) {
      throw new DomainError("VALIDATION_FAILED", "password appears in a known breach list", {
        details: { field: "password", reason: "BREACHED_PASSWORD" },
      });
    }

    const passwordHash = await this.deps.passwordHasher.hash(input.password);

    return this.deps.uow.run(async (tx) => {
      const users = this.deps.users(tx);

      const existing = await users.findByEmail(input.email);
      if (existing) {
        throw new DomainError("VALIDATION_FAILED", "email already registered", {
          details: { field: "email", reason: "EMAIL_ALREADY_REGISTERED" },
        });
      }

      const userId = this.deps.ids.next();
      await users.create({
        id: userId,
        email: input.email,
        passwordHash,
        dateOfBirth: input.dateOfBirth,
      });

      const now = this.deps.clock.now();
      const token = generateOpaqueToken();
      await this.deps.verificationTokens(tx).create({
        id: this.deps.ids.next(),
        userId,
        tokenHash: hashToken(token),
        createdAt: now,
        expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS),
      });

      await this.deps.mail.send(tx, {
        to: input.email,
        template: "verify-email",
        data: { token },
      });

      await this.deps.audit.record(tx, userRegisteredEvent(userId));

      return { userId };
    });
  }
}
