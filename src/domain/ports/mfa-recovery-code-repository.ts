export interface MfaRecoveryCode {
  readonly id: string;
  readonly userId: string;
  readonly codeHash: string;
  readonly createdAt: Date;
  readonly usedAt: Date | null;
}

export interface CreateMfaRecoveryCodeInput {
  readonly id: string;
  readonly userId: string;
  readonly codeHash: string;
  readonly createdAt: Date;
}

export interface MfaRecoveryCodeRepository {
  createMany(inputs: readonly CreateMfaRecoveryCodeInput[]): Promise<void>;
  findUnusedByUserAndCodeHash(userId: string, codeHash: string): Promise<MfaRecoveryCode | null>;
  markUsed(id: string, usedAt: Date): Promise<void>;
  /** Revokes (marks used) every still-unused code for a user, e.g. on MFA disable. */
  markAllUsedForUser(userId: string, usedAt: Date): Promise<void>;
}
