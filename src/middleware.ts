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
const NONCE_COOKIE_NAME = "csp_nonce";

/**
 * A nonce is only usable by the exact document the browser enforces CSP for: that CSP comes
 * from the *document* response's headers alone and is fixed for that document's whole lifetime,
 * but Next's App Router re-invokes this middleware for every same-document RSC fetch too (e.g.
 * client-side navigation back to a previously-visited route). Minting a fresh nonce on those
 * produced HTML whose inline <style nonce="..."> no longer matched the nonce the browser was
 * actually enforcing, so the browser silently dropped it - on this app that meant the hero's
 * entire stylesheet (and any other component doing the same) vanished after navigating away and
 * back. `Sec-Fetch-Dest: document` is only set on a real top-level navigation (full page load,
 * link/back/forward triggering a fresh document); every other request reuses the nonce already
 * issued for the current document, read back from this cookie.
 */
function resolveNonce(request: NextRequest): { nonce: string; isNewDocument: boolean } {
  const isNewDocument = request.headers.get("sec-fetch-dest") === "document";
  const existing = request.cookies.get(NONCE_COOKIE_NAME)?.value;
  if (!isNewDocument && existing) {
    return { nonce: existing, isNewDocument: false };
  }
  return { nonce: generateNonce(), isNewDocument: true };
}

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

  const { nonce, isNewDocument } = resolveNonce(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response, nonce);
  if (isNewDocument) {
    response.cookies.set(NONCE_COOKIE_NAME, nonce, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
    });
  }
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
