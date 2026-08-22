import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";

/**
 * Exercises the full auth pipeline through the real, running server (built +
 * started by playwright.config.ts's webServer, not the route handlers called
 * in-process) — proves middleware, CSRF cookies, and security headers are
 * actually wired end-to-end, not just unit-correct (T-316).
 */
test("register -> verify -> login -> see own session", async ({ request }) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const email = `e2e-${randomUUID()}@example.test`;
    const password = "a-strong-passphrase-42";

    const registerResponse = await request.post("/api/v1/auth/register", {
      data: { email, password, dateOfBirth: "1990-01-01" },
    });
    expect(registerResponse.status()).toBe(201);

    const { rows } = await pool.query<{ payload: { data: { token: string } } }>(
      "SELECT payload FROM outbox WHERE topic = 'mail' AND payload->>'to' = $1 ORDER BY created_at DESC LIMIT 1",
      [email],
    );
    const token = rows[0]?.payload.data.token;
    if (!token) {
      throw new Error("verification email not found in outbox");
    }

    const verifyResponse = await request.post("/api/v1/auth/verify-email", { data: { token } });
    expect(verifyResponse.status()).toBe(200);

    const loginResponse = await request.post("/api/v1/auth/login", { data: { email, password } });
    expect(loginResponse.status()).toBe(200);
    expect(loginResponse.headers()["content-security-policy"]).toContain("default-src 'self'");

    const meResponse = await request.get("/api/v1/me");
    expect(meResponse.status()).toBe(200);
    const me = (await meResponse.json()) as { email: string };
    expect(me.email).toBe(email);
  } finally {
    await pool.end();
  }
});
