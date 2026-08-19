import { generateSecret, generateURI, verify } from "otplib";
import type { MfaProvider } from "@/domain/ports";

/**
 * A one-time-step tolerance either side of "now" (Security.md §6 doesn't pin an
 * exact window; this absorbs realistic clock drift between server and
 * authenticator app without meaningfully widening the guessable code window).
 */
const EPOCH_TOLERANCE_STEPS = 1;

export class TotpMfaProvider implements MfaProvider {
  constructor(private readonly issuer: string) {}

  generateSecret(): string {
    return generateSecret();
  }

  buildOtpAuthUri(secret: string, accountLabel: string): string {
    return generateURI({ secret, label: accountLabel, issuer: this.issuer });
  }

  async verifyCode(secret: string, code: string): Promise<boolean> {
    const result = await verify({
      secret,
      token: code,
      epochTolerance: [EPOCH_TOLERANCE_STEPS, EPOCH_TOLERANCE_STEPS],
    });
    return result.valid;
  }
}
