import { NextResponse, type NextRequest } from "next/server";
import { loadConfig } from "@/platform/config";
import { buildSecurityHeaders, generateNonce } from "@/platform/headers/security-headers";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, verifyCsrf } from "@/platform/csrf/token";
import { toErrorResponse } from "@/platform/http/errors";
import { DomainError } from "@/domain/errors";

// loadConfig() and node:crypto-based helpers below are not edge-safe.
export const runtime = "nodejs";

export const config = {
  matcher: "/api/:path*",
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
        applySecurityHeaders(response);
        return response;
      }
    }
  }

  const response = NextResponse.next();
  applySecurityHeaders(response);
  return response;
}

function applySecurityHeaders(response: NextResponse): void {
  const headers = buildSecurityHeaders({ nonce: generateNonce() });
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
}
