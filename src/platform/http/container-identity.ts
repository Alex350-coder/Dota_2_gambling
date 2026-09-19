import type { DbTx } from "@/infra/db";
import type {
  AuditWriter,
  Clock,
  EmailVerificationTokenRepository,
  IdGenerator,
  LoginAttemptRepository,
  MailProvider,
  MfaProvider,
  MfaRecoveryCodeRepository,
  PasswordHasher,
  PasswordResetTokenRepository,
  SessionRepository,
  UnitOfWork,
  UserRepository,
} from "@/domain/ports";
import {
  RegisterUseCase,
  VerifyEmailUseCase,
  UpdateProfileUseCase,
  ChangePasswordUseCase,
  LoginUseCase,
  ListSessionsUseCase,
  RevokeSessionUseCase,
  ForgotPasswordUseCase,
  ResetPasswordUseCase,
  DisableMfaUseCase,
  EnrollMfaUseCase,
  RedeemMfaRecoveryCodeUseCase,
  VerifyMfaUseCase,
} from "@/application/identity";

/** Split out of `container.ts` purely to keep that file under the repo's `max-lines` cap — same
 * rationale as `container-settlement.ts`/`container-compliance.ts`, not a new architectural layer. */
export interface IdentityContainerDeps {
  readonly uow: UnitOfWork<DbTx>;
  readonly users: (tx: DbTx) => UserRepository;
  readonly verificationTokens: (tx: DbTx) => EmailVerificationTokenRepository;
  readonly resetTokens: (tx: DbTx) => PasswordResetTokenRepository;
  readonly loginAttempts: (tx: DbTx) => LoginAttemptRepository;
  readonly recoveryCodes: (tx: DbTx) => MfaRecoveryCodeRepository;
  readonly sessions: (tx: DbTx) => SessionRepository;
  readonly passwordHasher: PasswordHasher;
  readonly mail: MailProvider<DbTx>;
  readonly mfa: MfaProvider;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<DbTx>;
  readonly encryptionKey: string;
}

export interface IdentityUseCases<Tx> {
  readonly register: RegisterUseCase<Tx>;
  readonly verifyEmail: VerifyEmailUseCase<Tx>;
  readonly updateProfile: UpdateProfileUseCase<Tx>;
  readonly changePassword: ChangePasswordUseCase<Tx>;
  readonly login: LoginUseCase<Tx>;
  readonly listSessions: ListSessionsUseCase<Tx>;
  readonly revokeSession: RevokeSessionUseCase<Tx>;
  readonly forgotPassword: ForgotPasswordUseCase<Tx>;
  readonly resetPassword: ResetPasswordUseCase<Tx>;
  readonly enrollMfa: EnrollMfaUseCase<Tx>;
  readonly verifyMfa: VerifyMfaUseCase<Tx>;
  readonly disableMfa: DisableMfaUseCase<Tx>;
  readonly redeemMfaRecoveryCode: RedeemMfaRecoveryCodeUseCase<Tx>;
}

export function buildIdentityUseCases(deps: IdentityContainerDeps): IdentityUseCases<DbTx> {
  const {
    uow,
    users,
    verificationTokens,
    resetTokens,
    loginAttempts,
    recoveryCodes,
    sessions,
    passwordHasher,
    mail,
    mfa,
    ids,
    clock,
    audit,
    encryptionKey,
  } = deps;

  const mfaDeps = {
    uow,
    users,
    recoveryCodes,
    sessions,
    mfa,
    passwordHasher,
    ids,
    clock,
    encryptionKey,
    audit,
  };

  return {
    register: new RegisterUseCase<DbTx>({
      uow,
      users,
      verificationTokens,
      passwordHasher,
      mail,
      ids,
      clock,
      audit,
    }),
    verifyEmail: new VerifyEmailUseCase<DbTx>({ uow, users, verificationTokens, clock, audit }),
    updateProfile: new UpdateProfileUseCase<DbTx>({
      uow,
      users,
      verificationTokens,
      mail,
      ids,
      clock,
      audit,
    }),
    changePassword: new ChangePasswordUseCase<DbTx>({
      uow,
      users,
      sessions,
      passwordHasher,
      clock,
      audit,
    }),
    login: new LoginUseCase<DbTx>({ uow, users, loginAttempts, passwordHasher, clock, audit }),
    listSessions: new ListSessionsUseCase<DbTx>({ uow, sessions, clock }),
    revokeSession: new RevokeSessionUseCase<DbTx>({ uow, sessions, clock, audit }),
    forgotPassword: new ForgotPasswordUseCase<DbTx>({ uow, users, resetTokens, mail, ids, clock }),
    resetPassword: new ResetPasswordUseCase<DbTx>({
      uow,
      users,
      resetTokens,
      sessions,
      passwordHasher,
      clock,
      audit,
    }),
    enrollMfa: new EnrollMfaUseCase<DbTx>(mfaDeps),
    verifyMfa: new VerifyMfaUseCase<DbTx>(mfaDeps),
    disableMfa: new DisableMfaUseCase<DbTx>(mfaDeps),
    redeemMfaRecoveryCode: new RedeemMfaRecoveryCodeUseCase<DbTx>(mfaDeps),
  };
}
