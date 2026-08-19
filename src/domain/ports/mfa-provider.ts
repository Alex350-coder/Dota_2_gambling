/**
 * TOTP secret generation/verification (T-308). Kept separate from
 * PasswordHasher since the two use different primitives (Argon2id vs.
 * HMAC-based OTP) and are composed independently by the mfa use cases.
 */
export interface MfaProvider {
  generateSecret(): string;
  buildOtpAuthUri(secret: string, accountLabel: string): string;
  verifyCode(secret: string, code: string): Promise<boolean>;
}
