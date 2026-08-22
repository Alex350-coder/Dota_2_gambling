import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "@/infra/db/client";
import { testDbConfig } from "../../helpers/test-db-config";
import { resetAndMigrate } from "../../helpers/reset-db";

/**
 * getContainer() is a lazy singleton (T-316) — env vars must be set before the
 * first route handler call in this file, not before these imports.
 */
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

const { POST: registerRoute } = await import("@/app/api/v1/auth/register/route");
const { POST: verifyEmailRoute } = await import("@/app/api/v1/auth/verify-email/route");
const { POST: loginRoute } = await import("@/app/api/v1/auth/login/route");
const { POST: logoutRoute } = await import("@/app/api/v1/auth/logout/route");
const { POST: mfaEnrollRoute } = await import("@/app/api/v1/auth/mfa/enroll/route");
const { POST: mfaVerifyRoute } = await import("@/app/api/v1/auth/mfa/verify/route");
const { POST: mfaDisableRoute } = await import("@/app/api/v1/auth/mfa/disable/route");
const { GET: meRoute } = await import("@/app/api/v1/me/route");
const { GET: sessionsRoute } = await import("@/app/api/v1/me/sessions/route");
const { DELETE: sessionByIdRoute } = await import("@/app/api/v1/me/sessions/[id]/route");

const APP_URL = "https://app.example.test";
const PASSWORD = "a-strong-passphrase-42";

function jsonRequest(
  path: string,
  body: unknown,
  options: { cookie?: string; ip?: string } = {},
): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  if (options.ip) {
    headers["x-forwarded-for"] = options.ip;
  }
  return new Request(`${APP_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function getRequest(path: string, options: { cookie?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  return new Request(`${APP_URL}${path}`, { method: "GET", headers });
}

function sessionCookieFrom(response: Response): string {
  const setCookies = response.headers.getSetCookie();
  const sessionCookie = setCookies.find((c) => c.startsWith("sid="));
  if (!sessionCookie) {
    throw new Error("no session cookie in response");
  }
  return sessionCookie.split(";")[0] ?? "";
}

describe("auth API routes (T-316)", () => {
  const pool = createPool(testDbConfig());

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function registerAndVerify(ip: string): Promise<{ email: string; cookie: string }> {
    const email = `route-${randomUUID()}@example.test`;
    const registerResponse = await registerRoute(
      jsonRequest(
        "/api/v1/auth/register",
        { email, password: PASSWORD, dateOfBirth: "1990-01-01" },
        { ip },
      ),
    );
    expect(registerResponse.status).toBe(201);

    const [outboxRow] = await pool
      .query(
        "SELECT payload FROM outbox WHERE topic = 'mail' AND payload->>'to' = $1 ORDER BY created_at DESC LIMIT 1",
        [email],
      )
      .then((r) => r.rows as { payload: { data: { token: string } } }[]);
    if (!outboxRow) {
      throw new Error("verification email not found in outbox");
    }

    const verifyResponse = await verifyEmailRoute(
      jsonRequest("/api/v1/auth/verify-email", { token: outboxRow.payload.data.token }, { ip }),
    );
    expect(verifyResponse.status).toBe(200);

    const loginResponse = await loginRoute(
      jsonRequest("/api/v1/auth/login", { email, password: PASSWORD }, { ip }),
    );
    expect(loginResponse.status).toBe(200);

    return { email, cookie: sessionCookieFrom(loginResponse) };
  }

  it("rejects a registration payload carrying a server-controlled extra field", async () => {
    const response = await registerRoute(
      jsonRequest(
        "/api/v1/auth/register",
        {
          email: `route-${randomUUID()}@example.test`,
          password: PASSWORD,
          dateOfBirth: "1990-01-01",
          role: "ADMIN",
        },
        { ip: "203.0.113.200" },
      ),
    );

    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects registration for an under-18 date of birth (MET-RG-01)", async () => {
    const response = await registerRoute(
      jsonRequest(
        "/api/v1/auth/register",
        {
          email: `route-${randomUUID()}@example.test`,
          password: PASSWORD,
          dateOfBirth: new Date().toISOString().slice(0, 10),
        },
        { ip: "203.0.113.201" },
      ),
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AGE_REQUIREMENT_NOT_MET");
  });

  it("registers, verifies, logs in, and lets the caller read their own profile and sessions", async () => {
    const { email, cookie } = await registerAndVerify("203.0.113.10");

    const meResponse = await meRoute(getRequest("/api/v1/me", { cookie }));
    expect(meResponse.status).toBe(200);
    const me = (await meResponse.json()) as { email: string; mfaEnabled: boolean };
    expect(me.email).toBe(email);
    expect(me.mfaEnabled).toBe(false);

    const sessionsResponse = await sessionsRoute(getRequest("/api/v1/me/sessions", { cookie }));
    expect(sessionsResponse.status).toBe(200);
    const { sessions } = (await sessionsResponse.json()) as { sessions: { id: string }[] };
    expect(sessions).toHaveLength(1);
  });

  it("returns every Security.md §8 header on both success and error responses", async () => {
    const response = await registerRoute(
      jsonRequest(
        "/api/v1/auth/register",
        {
          email: `route-${randomUUID()}@example.test`,
          password: "too-short",
          dateOfBirth: "1990-01-01",
        },
        { ip: "203.0.113.202" },
      ),
    );
    expect(response.status).toBe(422);
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  describe("authorization-negative cases (MET-COV-04)", () => {
    it("GET /me without a session cookie is UNAUTHENTICATED", async () => {
      const response = await meRoute(getRequest("/api/v1/me"));
      expect(response.status).toBe(401);
    });

    it("GET /me/sessions without a session cookie is UNAUTHENTICATED", async () => {
      const response = await sessionsRoute(getRequest("/api/v1/me/sessions"));
      expect(response.status).toBe(401);
    });

    it("POST /auth/logout without a session cookie is UNAUTHENTICATED", async () => {
      const response = await logoutRoute(
        jsonRequest("/api/v1/auth/logout", {}, { ip: "203.0.113.20" }),
      );
      expect(response.status).toBe(401);
    });

    it("POST /auth/mfa/enroll without a session cookie is UNAUTHENTICATED", async () => {
      const response = await mfaEnrollRoute(
        jsonRequest("/api/v1/auth/mfa/enroll", {}, { ip: "203.0.113.21" }),
      );
      expect(response.status).toBe(401);
    });

    it("POST /auth/mfa/verify without a session cookie is UNAUTHENTICATED", async () => {
      const response = await mfaVerifyRoute(
        jsonRequest("/api/v1/auth/mfa/verify", { code: "000000" }, { ip: "203.0.113.22" }),
      );
      expect(response.status).toBe(401);
    });

    it("POST /auth/mfa/disable without a session cookie is UNAUTHENTICATED", async () => {
      const response = await mfaDisableRoute(
        jsonRequest("/api/v1/auth/mfa/disable", { password: PASSWORD }, { ip: "203.0.113.23" }),
      );
      expect(response.status).toBe(401);
    });

    it("DELETE /me/sessions/{id} for another user's session is RESOURCE_NOT_FOUND, not leaked", async () => {
      const owner = await registerAndVerify("203.0.113.30");
      const attacker = await registerAndVerify("203.0.113.31");

      const ownerSessions = (await sessionsRoute(
        getRequest("/api/v1/me/sessions", { cookie: owner.cookie }),
      ).then((r) => r.json())) as { sessions: { id: string }[] };
      const ownerSessionId = ownerSessions.sessions[0]?.id;
      if (!ownerSessionId) {
        throw new Error("owner has no session");
      }

      const response = await sessionByIdRoute(
        getRequest(`/api/v1/me/sessions/${ownerSessionId}`, { cookie: attacker.cookie }),
        { params: Promise.resolve({ id: ownerSessionId }) },
      );
      expect(response.status).toBe(404);
    });

    it("DELETE /me/sessions/{id} with a malformed id is VALIDATION_FAILED, not a 500", async () => {
      const { cookie } = await registerAndVerify("203.0.113.32");
      const response = await sessionByIdRoute(
        getRequest("/api/v1/me/sessions/not-a-uuid", { cookie }),
        { params: Promise.resolve({ id: "not-a-uuid" }) },
      );
      expect(response.status).toBe(422);
    });
  });

  it("logs the caller out and revokes the session cookie", async () => {
    const { cookie } = await registerAndVerify("203.0.113.40");

    const logoutResponse = await logoutRoute(
      new Request(`${APP_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: { cookie, "x-forwarded-for": "203.0.113.40" },
      }),
    );
    expect(logoutResponse.status).toBe(200);

    const meResponse = await meRoute(getRequest("/api/v1/me", { cookie }));
    expect(meResponse.status).toBe(401);
  });

  it("rate-limits repeated registration requests from the same IP (auth-strict class)", async () => {
    const ip = "203.0.113.90";
    let lastResponse: Response | undefined;
    for (let i = 0; i < 11; i += 1) {
      lastResponse = await registerRoute(
        jsonRequest(
          "/api/v1/auth/register",
          {
            email: `route-rl-${randomUUID()}@example.test`,
            password: PASSWORD,
            dateOfBirth: "1990-01-01",
          },
          { ip },
        ),
      );
    }

    expect(lastResponse?.status).toBe(429);
    expect(lastResponse?.headers.get("Retry-After")).toBeTruthy();
  });
});
