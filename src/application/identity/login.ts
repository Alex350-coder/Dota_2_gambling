import { DomainError } from "@/domain/errors";
import type {
  AuditWriter,
  Clock,
  LoginAttemptRepository,
  PasswordHasher,
  UnitOfWork,
  UserRepository,
} from "@/domain/ports";
import { hashIdentifier } from "@/platform/crypto";
import { loginSucceededEvent } from "@/application/audit/writer";

/** Progressive lockout window (Security.md §5: "temporary lock per email_hash/ip_hash"). */
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

/**
 * Argon2id-shaped placeholder hash verified against on every "user not found" or
 * "account has no password yet" path, so the Argon2 cost is paid on both branches
 * and unknown-email vs wrong-password stay timing-indistinguishable (T-304 AC).
 */
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=262144,t=3,p=1$MDAwMDAwMDAwMDAwMDAwMA$" +
  "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA";

const INVALID_CREDENTIALS_MESSAGE = "invalid email or password";

export interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly ip: string | null;
}

export interface LoginResult {
  readonly userId: string;
}

export interface LoginDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
  readonly loginAttempts: (tx: Tx) => LoginAttemptRepository;
  readonly passwordHasher: PasswordHasher;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

export class LoginUseCase<Tx> {
  constructor(private readonly deps: LoginDeps<Tx>) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const emailHash = hashIdentifier(input.email);
    const ipHash = input.ip === null ? null : hashIdentifier(input.ip);
    const now = this.deps.clock.now();

    const recentFailures = await this.deps.uow.run((tx) =>
      this.deps
        .loginAttempts(tx)
        .countRecentFailures(emailHash, ipHash, new Date(now.getTime() - LOCKOUT_WINDOW_MS)),
    );
    if (recentFailures >= MAX_FAILED_ATTEMPTS) {
      throw new DomainError("RATE_LIMITED", "too many failed login attempts, try again later");
    }

    const user = await this.deps.uow.run((tx) => this.deps.users(tx).findByEmail(input.email));
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;

    const passwordMatches = await this.deps.passwordHasher.verify(passwordHash, input.password);
    const hasUsablePassword = user?.passwordHash != null;
    const succeeded = hasUsablePassword && passwordMatches;

    // Recorded in its own transaction, separate from the transaction that may
    // throw below — otherwise the throw would roll back the audit record too
    // and the lockout counter would never advance past zero failures.
    await this.deps.uow.run(async (tx) => {
      await this.deps.loginAttempts(tx).record({ emailHash, ipHash, succeeded });
      if (succeeded) {
        await this.deps.audit.record(tx, loginSucceededEvent(user.id));
      }
    });

    if (!succeeded) {
      throw new DomainError("UNAUTHENTICATED", INVALID_CREDENTIALS_MESSAGE);
    }

    // succeeded implies hasUsablePassword, which implies user is non-null (TS
    // narrows this via the aliased `hasUsablePassword`/`succeeded` conditions above).
    return { userId: user.id };
  }
}
