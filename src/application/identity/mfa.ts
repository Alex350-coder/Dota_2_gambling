import { DomainError } from "@/domain/errors";
import type {
  AuditWriter,
  Clock,
  IdGenerator,
  MfaProvider,
  MfaRecoveryCodeRepository,
  PasswordHasher,
  SessionRepository,
  UnitOfWork,
  UserRepository,
} from "@/domain/ports";
import { decrypt, encrypt, hashToken } from "@/platform/crypto";
import {
  mfaDisabledEvent,
  mfaEnrolledEvent,
  mfaRecoveryCodeRedeemedEvent,
  mfaVerifiedEvent,
} from "@/application/audit/writer";

const RECOVERY_CODE_COUNT = 8;

export interface MfaDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
  readonly recoveryCodes: (tx: Tx) => MfaRecoveryCodeRepository;
  readonly sessions: (tx: Tx) => SessionRepository;
  readonly mfa: MfaProvider;
  readonly passwordHasher: PasswordHasher;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly encryptionKey: string;
  readonly audit: AuditWriter<Tx>;
}

export interface EnrollMfaInput {
  readonly userId: string;
  readonly accountLabel: string;
}

export interface EnrollMfaResult {
  readonly otpAuthUri: string;
  readonly recoveryCodes: readonly string[];
}

/**
 * Generates a new TOTP secret and a fresh batch of recovery codes, but does
 * NOT activate MFA yet — that only happens once VerifyMfaUseCase confirms the
 * user's authenticator app is actually in sync (T-308 AC: "enrol → verify →
 * active"). Re-running enrol before verifying replaces the pending secret.
 */
export class EnrollMfaUseCase<Tx> {
  constructor(private readonly deps: MfaDeps<Tx>) {}

  async execute(input: EnrollMfaInput): Promise<EnrollMfaResult> {
    const secret = this.deps.mfa.generateSecret();
    const otpAuthUri = this.deps.mfa.buildOtpAuthUri(secret, input.accountLabel);
    const now = this.deps.clock.now();
    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => this.deps.ids.next());

    await this.deps.uow.run(async (tx) => {
      await this.deps
        .users(tx)
        .setMfaSecret(input.userId, encrypt(secret, this.deps.encryptionKey), now);
      await this.deps.recoveryCodes(tx).createMany(
        recoveryCodes.map((code) => ({
          id: this.deps.ids.next(),
          userId: input.userId,
          codeHash: hashToken(code),
          createdAt: now,
        })),
      );
      await this.deps.audit.record(tx, mfaEnrolledEvent(input.userId));
    });

    return { otpAuthUri, recoveryCodes };
  }
}

export interface VerifyMfaInput {
  readonly userId: string;
  readonly code: string;
  /** When provided, marks this session as freshly step-up-verified (T-412). */
  readonly sessionId?: string;
}

/**
 * Verifies a TOTP code against the enrolled secret; activates MFA on first
 * success (T-308). Every successful verify — first-time or repeat — also
 * marks the caller's session as freshly step-up-verified when `sessionId` is
 * given, so the same endpoint doubles as the step-up re-auth flow admin
 * routes require (T-412).
 */
export class VerifyMfaUseCase<Tx> {
  constructor(private readonly deps: MfaDeps<Tx>) {}

  async execute(input: VerifyMfaInput): Promise<void> {
    const now = this.deps.clock.now();

    await this.deps.uow.run(async (tx) => {
      const users = this.deps.users(tx);
      const user = await users.findById(input.userId);

      if (!user?.mfaSecretEnc) {
        throw new DomainError("MFA_INVALID_CODE", "no MFA enrollment in progress for this user");
      }

      const secret = decrypt(user.mfaSecretEnc, this.deps.encryptionKey);
      const isValid = await this.deps.mfa.verifyCode(secret, input.code);
      if (!isValid) {
        throw new DomainError("MFA_INVALID_CODE", "the provided code is invalid or expired");
      }

      if (!user.mfaEnabledAt) {
        await users.activateMfa(input.userId, now);
        await this.deps.audit.record(tx, mfaVerifiedEvent(input.userId));
      }

      if (input.sessionId !== undefined) {
        await this.deps.sessions(tx).markMfaVerified(input.sessionId, now);
      }
    });
  }
}

export interface DisableMfaInput {
  readonly userId: string;
  readonly password: string;
}

/** Disabling MFA requires re-proving the account password (Security.md §6 step-up). */
export class DisableMfaUseCase<Tx> {
  constructor(private readonly deps: MfaDeps<Tx>) {}

  async execute(input: DisableMfaInput): Promise<void> {
    const now = this.deps.clock.now();

    await this.deps.uow.run(async (tx) => {
      const users = this.deps.users(tx);
      const user = await users.findById(input.userId);

      const passwordMatches =
        user?.passwordHash != null &&
        (await this.deps.passwordHasher.verify(user.passwordHash, input.password));
      if (!passwordMatches) {
        throw new DomainError("UNAUTHENTICATED", "password re-verification failed");
      }

      await users.disableMfa(input.userId, now);
      await this.deps.recoveryCodes(tx).markAllUsedForUser(input.userId, now);
      await this.deps.audit.record(tx, mfaDisabledEvent(input.userId));
    });
  }
}

export interface RedeemMfaRecoveryCodeInput {
  readonly userId: string;
  readonly code: string;
}

/** Redeems a single-use recovery code as an alternative to a TOTP code. */
export class RedeemMfaRecoveryCodeUseCase<Tx> {
  constructor(private readonly deps: MfaDeps<Tx>) {}

  async execute(input: RedeemMfaRecoveryCodeInput): Promise<void> {
    const now = this.deps.clock.now();
    const codeHash = hashToken(input.code);

    await this.deps.uow.run(async (tx) => {
      const recoveryCodes = this.deps.recoveryCodes(tx);
      const record = await recoveryCodes.findUnusedByUserAndCodeHash(input.userId, codeHash);
      if (!record) {
        throw new DomainError("MFA_INVALID_CODE", "the recovery code is invalid or already used");
      }

      await recoveryCodes.markUsed(record.id, now);
      await this.deps.audit.record(tx, mfaRecoveryCodeRedeemedEvent(input.userId));
    });
  }
}
