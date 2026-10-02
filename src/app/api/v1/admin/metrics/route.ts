// PUBLIC_ROUTE
// (not session-authenticated — require-authz.cjs only recognizes authorize()/authorizeSelf();
// this route enforces its own bearer-token check below instead, since a metrics scraper has no
// session to authorize())
import { timingSafeEqual } from "node:crypto";
import { getContainer } from "@/platform/http/container";

/**
 * Constant-time comparison against the configured bearer token — a plain `!==`/`===` string
 * compare short-circuits on the first mismatched byte, leaking a timing side-channel that an
 * attacker could use to recover `METRICS_TOKEN` one character at a time (RULE-E08/E09). Mirrors
 * the same pattern already used for CSRF token comparison (src/platform/csrf/token.ts).
 */
function safeTokenEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still runs a fixed-cost compare so this branch isn't itself a faster timing tell.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * T-911 — an authenticated internal endpoint (OBSERVABILITY.md §3: "exposed on an authenticated
 * internal endpoint, not publicly"). Deliberately NOT session/cookie-authenticated: a metrics
 * scraper (Prometheus or similar) is not a logged-in admin, so this uses a static bearer token
 * (`METRICS_TOKEN`) instead. Disabled entirely when `METRICS_ENABLED=false`.
 */
export function GET(request: Request): Response {
  const container = getContainer();

  if (!container.config.METRICS_ENABLED) {
    return new Response(null, { status: 404 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${container.config.METRICS_TOKEN}`;
  if (!safeTokenEquals(authorization, expected)) {
    return new Response(null, { status: 401 });
  }

  return new Response(container.metrics.toPrometheusText(), {
    status: 200,
    headers: { "content-type": "text/plain; version=0.0.4" },
  });
}
