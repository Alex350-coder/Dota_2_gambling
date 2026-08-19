import { randomBytes } from "node:crypto";

export interface SecurityHeadersInput {
  readonly nonce: string;
}

/** Exact header set/values required by Claude/Security.md §8. */
export function buildSecurityHeaders(input: SecurityHeadersInput): Record<string, string> {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      `script-src 'self' 'nonce-${input.nonce}'`,
      `style-src 'self' 'nonce-${input.nonce}'`,
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}

/** One nonce per request/response — never cached or reused across requests. */
export function generateNonce(): string {
  return randomBytes(16).toString("base64");
}
