import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

/**
 * middleware.ts calls loadConfig() (T-316) — env vars must be set before the dynamic import
 * below runs.
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
const NONCE_COOKIE_NAME = "csp_nonce";

function pageRequest(options: { secFetchDest?: string; nonceCookie?: string }): NextRequest {
  const headers = new Headers();
  if (options.secFetchDest) {
    headers.set("sec-fetch-dest", options.secFetchDest);
  }
  if (options.nonceCookie) {
    headers.set("cookie", `${NONCE_COOKIE_NAME}=${options.nonceCookie}`);
  }
  return new NextRequest(`${APP_URL}/`, { method: "GET", headers });
}

function cspNonce(response: Response): string | null {
  const csp = response.headers.get("Content-Security-Policy") ?? "";
  const match = /script-src 'self' 'nonce-([^']+)'/.exec(csp);
  return match?.[1] ?? null;
}

/**
 * T-717 follow-up: a fresh nonce used to be minted on every request middleware saw, including
 * the same-document RSC fetches Next's client router makes for soft navigation. The browser
 * only enforces the CSP header from the original document load, so any inline <style>/<script>
 * rendered during a later RSC fetch carried a nonce that no longer matched - silently dropped,
 * breaking styling after navigating away and back. These tests pin the fix: the nonce is only
 * rotated on a genuine document load (Sec-Fetch-Dest: document) and reused from the csp_nonce
 * cookie for everything else within that document's lifetime.
 */
describe("middleware CSP nonce persistence", () => {
  it("mints a fresh nonce and sets the cookie on a real document load", async () => {
    const { middleware } = await import("@/middleware");
    const response = middleware(pageRequest({ secFetchDest: "document" }));
    const nonce = cspNonce(response);
    expect(nonce).toBeTruthy();
    expect(response.cookies.get(NONCE_COOKIE_NAME)?.value).toBe(nonce);
  });

  it("reuses the cookie's nonce for a same-document RSC fetch, without rotating the cookie", async () => {
    const { middleware } = await import("@/middleware");
    const existingNonce = "existing-nonce-value";
    const response = middleware(pageRequest({ nonceCookie: existingNonce }));
    expect(cspNonce(response)).toBe(existingNonce);
    expect(response.cookies.get(NONCE_COOKIE_NAME)).toBeUndefined();
  });

  it("mints a fresh nonce when no document request and no existing cookie are present", async () => {
    const { middleware } = await import("@/middleware");
    const response = middleware(pageRequest({}));
    const nonce = cspNonce(response);
    expect(nonce).toBeTruthy();
    expect(response.cookies.get(NONCE_COOKIE_NAME)?.value).toBe(nonce);
  });

  it("rotates to a brand-new nonce on a document load even if a stale cookie is present", async () => {
    const { middleware } = await import("@/middleware");
    const staleNonce = "stale-nonce-from-a-previous-document";
    const response = middleware(pageRequest({ secFetchDest: "document", nonceCookie: staleNonce }));
    const nonce = cspNonce(response);
    expect(nonce).not.toBe(staleNonce);
    expect(response.cookies.get(NONCE_COOKIE_NAME)?.value).toBe(nonce);
  });
});
