import { describe, expect, it } from "vitest";

process.env.APP_URL ??= "https://app.example.test";
process.env.ENCRYPTION_KEY ??= "0".repeat(48);
process.env.ARGON2_MEMORY_COST ??= "8";
process.env.ARGON2_TIME_COST ??= "1";
process.env.ARGON2_PARALLELISM ??= "1";
process.env.MFA_ISSUER ??= "Dota Gambling Test";
process.env.RATE_LIMIT_ENABLED ??= "true";
process.env.RG_DEFAULT_DAILY_STAKE_LIMIT_MINOR ??= "100000";
process.env.RG_LIMIT_INCREASE_COOLING_OFF_HOURS ??= "24";
process.env.SIMULATED_CREDIT_DAILY_CAP_MINOR ??= "100000";
process.env.METRICS_ENABLED ??= "true";
process.env.METRICS_TOKEN ??= "test-metrics-token";

const { GET: metricsRoute } = await import("@/app/api/v1/admin/metrics/route");
const { getContainer } = await import("@/platform/http/container");

const APP_URL = "https://app.example.test";

/** T-911 — "not publicly reachable" (OBSERVABILITY.md §3): the metrics scraper endpoint is
 * bearer-token authenticated, never a logged-in session (MET-COV-04's spirit — a negative
 * auth test — applies here even though it's not a session-based authorize() route). */
describe("GET /admin/metrics (T-911)", () => {
  it("rejects a request with no Authorization header with 401", () => {
    const response = metricsRoute(new Request(`${APP_URL}/api/v1/admin/metrics`));
    expect(response.status).toBe(401);
  });

  it("rejects a request with the wrong token with 401", () => {
    const response = metricsRoute(
      new Request(`${APP_URL}/api/v1/admin/metrics`, {
        headers: { authorization: "Bearer wrong-token" },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns Prometheus text with the correct bearer token", async () => {
    getContainer().metrics.counter("http_requests_total", "total HTTP requests").inc({
      route: "/api/v1/example",
      status: "200",
    });

    const response = metricsRoute(
      new Request(`${APP_URL}/api/v1/admin/metrics`, {
        headers: { authorization: "Bearer test-metrics-token" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    const text = await response.text();
    expect(text).toContain("# TYPE http_requests_total counter");
  });
});
