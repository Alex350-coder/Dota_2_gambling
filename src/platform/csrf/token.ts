import { timingSafeEqual } from "node:crypto";
import { generateOpaqueToken } from "@/platform/crypto";

/** Double-submit CSRF token: same primitive as session tokens (256-bit, url-safe). */
export function generateCsrfToken(): string {
  return generateOpaqueToken();
}

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Unlike the session cookie, this one is deliberately *not* HttpOnly — the
 * double-submit pattern requires client JS to read it and echo it back in
 * `x-csrf-token` on the next mutating request.
 */
export function serializeCsrfCookie(token: string): string {
  return [`${CSRF_COOKIE_NAME}=${token}`, "Path=/", "Secure", "SameSite=Lax"].join("; ");
}

export interface CsrfCheckInput {
  readonly cookieToken: string | undefined;
  readonly headerToken: string | undefined;
  readonly origin: string | undefined;
  readonly allowedOrigin: string;
}

/**
 * Double-submit cookie + Origin check (Security.md T-10 / RULE list): both the
 * cookie and header token must be present and equal, and the request's Origin
 * must match the app's own origin. Any single failure rejects — no partial trust.
 */
export function verifyCsrf(input: CsrfCheckInput): boolean {
  if (!input.cookieToken || !input.headerToken) {
    return false;
  }
  if (!tokensMatch(input.cookieToken, input.headerToken)) {
    return false;
  }
  if (!input.origin || input.origin !== input.allowedOrigin) {
    return false;
  }
  return true;
}

function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
