// PUBLIC_ROUTE
// (not session-authenticated — require-authz.cjs only recognizes authorize()/authorizeSelf();
// this route enforces its own bearer-token check below instead, since a metrics scraper has no
// session to authorize())
import { getContainer } from "@/platform/http/container";

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

  const authorization = request.headers.get("authorization");
  const expected = `Bearer ${container.config.METRICS_TOKEN}`;
  if (authorization !== expected) {
    return new Response(null, { status: 401 });
  }

  return new Response(container.metrics.toPrometheusText(), {
    status: 200,
    headers: { "content-type": "text/plain; version=0.0.4" },
  });
}
