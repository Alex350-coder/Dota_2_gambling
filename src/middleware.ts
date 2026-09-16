import { NextResponse, type NextRequest } from "next/server";
import { loadConfig } from "@/platform/config";
import { buildSecurityHeaders, generateNonce } from "@/platform/headers/security-headers";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, verifyCsrf } from "@/platform/csrf/token";
import { toErrorResponse } from "@/platform/http/errors";
import { DomainError } from "@/domain/errors";

// loadConfig() and node:crypto-based helpers below are not edge-safe.
export const runtime = "nodejs";

/**
 * T-702 (Plan.md P7 security requirement: "strict CSP with nonces") extends this matcher from
 * API-only to every route, public pages included, excluding static/build assets that can't
 * carry a per-request nonce anyway.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF is only enforced for mutating requests carrying an existing session
 * cookie: public routes (register/login) have no prior session and aren't
 * CSRF-able the same way, so requiring a CSRF cookie there would just break
 * first-time visitors without adding protection.
 */
export function middleware(request: NextRequest): NextResponse {
  const appConfig = loadConfig();

  if (MUTATING_METHODS.has(request.method)) {
    const sessionToken = request.cookies.get(appConfig.SESSION_COOKIE_NAME)?.value;
    if (sessionToken) {
      const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
      const headerToken = request.headers.get(CSRF_HEADER_NAME) ?? undefined;
      const origin = request.headers.get("origin") ?? undefined;
      const valid = verifyCsrf({
        cookieToken,
        headerToken,
        origin,
        allowedOrigin: appConfig.APP_URL,
      });
      if (!valid) {
        const response = toErrorResponse(
          new DomainError("UNAUTHORIZED_OPERATION", "invalid or missing CSRF token"),
        );
        applySecurityHeaders(response, generateNonce());
        return response;
      }
    }
  }

  const nonce = generateNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response, nonce);
  return response;
}

/**
 * `nonce` is forwarded on the *request* headers above (not just the response) so Next.js can
 * apply the same nonce to the inline scripts it injects for RSC/hydration during this render —
 * generating a second, mismatched nonce here would make Next's own scripts violate the CSP
 * header we're about to set.
 */
function applySecurityHeaders(response: NextResponse, nonce: string): void {
  const headers = buildSecurityHeaders({ nonce });
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
}
