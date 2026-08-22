import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { generateCsrfToken, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/platform/csrf/token";

/**
 * middleware.ts calls loadConfig() (T-316) — env vars must be set before the
 * dynamic import below runs.
 */
beforeAll(() => {
  process.env.APP_URL ??= "https://app.example.test";
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5544/betting_dev";
  process.env.ENCRYPTION_KEY ??= "0".repeat(48);
  process.env.MFA_ISSUER ??= "Dota Gambling Test";
  process.env.RATE_LIMIT_ENABLED ??= "true";
  process.env.RG_DEFAULT_DAILY_STAKE_LIMIT_MINOR ??= "100000";
  process.env.RG_LIMIT_INCREASE_COOLING_OFF_HOURS ??= "24";
  process.env.SIMULATED_CREDIT_DAILY_CAP_MINOR ??= "100000";
  process.env.METRICS_ENABLED ??= "true";
  process.env.METRICS_TOKEN ??= "test-metrics-token";
});

const APP_URL = "https://app.example.test";

function mutatingRequest(options: {
  sessionCookie?: string;
  csrfCookie?: string;
  csrfHeader?: string;
  origin?: string;
}): NextRequest {
  const headers = new Headers();
  const cookieParts: string[] = [];
  if (options.sessionCookie) {
    cookieParts.push(`sid=${options.sessionCookie}`);
  }
  if (options.csrfCookie) {
    cookieParts.push(`${CSRF_COOKIE_NAME}=${options.csrfCookie}`);
  }
  if (cookieParts.length > 0) {
    headers.set("cookie", cookieParts.join("; "));
  }
  if (options.csrfHeader) {
    headers.set(CSRF_HEADER_NAME, options.csrfHeader);
  }
  if (options.origin) {
    headers.set("origin", options.origin);
  }
  return new NextRequest(`${APP_URL}/api/v1/me/sessions/some-id`, {
    method: "DELETE",
    headers,
  });
}

describe("middleware CSRF enforcement", () => {
  it("rejects a mutating authenticated request missing the CSRF token", async () => {
    const { middleware } = await import("@/middleware");
    const response = middleware(mutatingRequest({ sessionCookie: "some-session-token" }));
    expect(response.status).toBe(403);
  });

  it("rejects a mutating authenticated request with mismatched cookie/header tokens", async () => {
    const { middleware } = await import("@/middleware");
    const response = middleware(
      mutatingRequest({
        sessionCookie: "some-session-token",
        csrfCookie: generateCsrfToken(),
        csrfHeader: generateCsrfToken(),
        origin: APP_URL,
      }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects a mutating authenticated request from a foreign Origin", async () => {
    const { middleware } = await import("@/middleware");
    const token = generateCsrfToken();
    const response = middleware(
      mutatingRequest({
        sessionCookie: "some-session-token",
        csrfCookie: token,
        csrfHeader: token,
        origin: "https://evil.test",
      }),
    );
    expect(response.status).toBe(403);
  });

  it("allows a mutating authenticated request with a matching CSRF token and origin", async () => {
    const { middleware } = await import("@/middleware");
    const token = generateCsrfToken();
    const response = middleware(
      mutatingRequest({
        sessionCookie: "some-session-token",
        csrfCookie: token,
        csrfHeader: token,
        origin: APP_URL,
      }),
    );
    expect(response.status).toBe(200);
  });

  it("does not require a CSRF token for a mutating request with no session cookie (public routes)", async () => {
    const { middleware } = await import("@/middleware");
    const response = middleware(mutatingRequest({}));
    expect(response.status).toBe(200);
  });

  it("applies the Security.md §8 header set to every response", async () => {
    const { middleware } = await import("@/middleware");
    const response = middleware(mutatingRequest({}));
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
