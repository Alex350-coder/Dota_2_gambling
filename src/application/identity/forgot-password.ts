import type {
  Clock,
  IdGenerator,
  MailProvider,
  PasswordResetTokenRepository,
  UnitOfWork,
  UserRepository,
} from "@/domain/ports";
import { generateOpaqueToken, hashToken } from "@/platform/crypto";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface ForgotPasswordInput {
  readonly email: string;
}

export interface ForgotPasswordDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
  readonly resetTokens: (tx: Tx) => PasswordResetTokenRepository;
  readonly mail: MailProvider<Tx>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/**
 * Always resolves (Routes.md §3: "always 202, no enumeration") — whether or not
 * the email belongs to an account never changes the caller-visible outcome or
 * timing-relevant work performed, matching the no-enumeration shape already used
 * by LoginUseCase.
 */
export class ForgotPasswordUseCase<Tx> {
  constructor(private readonly deps: ForgotPasswordDeps<Tx>) {}

  async execute(input: ForgotPasswordInput): Promise<void> {
    await this.deps.uow.run(async (tx) => {
      const user = await this.deps.users(tx).findByEmail(input.email);
      if (!user) {
        return;
      }

      const now = this.deps.clock.now();
      const token = generateOpaqueToken();
      await this.deps.resetTokens(tx).create({
        id: this.deps.ids.next(),
        userId: user.id,
        tokenHash: hashToken(token),
        createdAt: now,
        expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      });

      await this.deps.mail.send(tx, {
        to: input.email,
        template: "reset-password",
        data: { token },
      });
    });
  }
}
