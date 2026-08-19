export interface EmailVerificationToken {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
}

export interface CreateEmailVerificationTokenInput {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface EmailVerificationTokenRepository {
  create(input: CreateEmailVerificationTokenInput): Promise<EmailVerificationToken>;
  findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | null>;
  markUsed(id: string, usedAt: Date): Promise<void>;
}
