import { randomBytes } from "node:crypto";

export interface SecurityHeadersInput {
  readonly nonce: string;
}

/**
 * Exact header set/values required by Claude/Security.md §8.
 *
 * `script-src` gets `'unsafe-eval'` added only under `next dev` (`NODE_ENV === "development"`):
 * Next's React Fast Refresh runtime evaluates code via `eval()` to apply HMR updates, and without
 * this the strict nonce CSP throws an EvalError inside main-app.js on first execution - before
 * hydrateRoot() ever runs, so nothing on the page ever hydrates (no effects, no click handlers,
 * the app looks completely dead). Production builds don't ship Fast Refresh, so `pnpm build`/
 * `pnpm start` stay exactly as strict as before; this never fires with NODE_ENV=test either, so
 * this file's own test suite still asserts the strict policy.
 */
export function buildSecurityHeaders(input: SecurityHeadersInput): Record<string, string> {
  const isDev = process.env.NODE_ENV === "development";
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      `script-src 'self' 'nonce-${input.nonce}'${isDev ? " 'unsafe-eval'" : ""}`,
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
