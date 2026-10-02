import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSecurityHeaders, generateNonce } from "./security-headers";

describe("buildSecurityHeaders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds a nonce-based CSP with no unsafe-inline or unsafe-eval in script-src", () => {
    const headers = buildSecurityHeaders({ nonce: "test-nonce-value" });
    const csp = headers["Content-Security-Policy"];

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'nonce-test-nonce-value'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("stays strict (no unsafe-eval) in production, even explicitly", () => {
    vi.stubEnv("NODE_ENV", "production");
    const csp = buildSecurityHeaders({ nonce: "n" })["Content-Security-Policy"];
    expect(csp).not.toContain("unsafe-eval");
  });

  it("adds unsafe-eval to script-src only under NODE_ENV=development (Fast Refresh needs eval)", () => {
    vi.stubEnv("NODE_ENV", "development");
    const csp = buildSecurityHeaders({ nonce: "n" })["Content-Security-Policy"];
    expect(csp).toContain("script-src 'self' 'nonce-n' 'unsafe-eval'");
    expect(csp).not.toContain("style-src 'self' 'nonce-n' 'unsafe-eval'");
  });

  it("sets Strict-Transport-Security for two years with preload", () => {
    const headers = buildSecurityHeaders({ nonce: "n" });
    expect(headers["Strict-Transport-Security"]).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
  });

  it("sets X-Content-Type-Options to nosniff", () => {
    const headers = buildSecurityHeaders({ nonce: "n" });
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("sets Referrer-Policy to strict-origin-when-cross-origin", () => {
    const headers = buildSecurityHeaders({ nonce: "n" });
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("denies camera, microphone, geolocation, and payment in Permissions-Policy", () => {
    const headers = buildSecurityHeaders({ nonce: "n" });
    const policy = headers["Permissions-Policy"];
    expect(policy).toContain("camera=()");
    expect(policy).toContain("microphone=()");
    expect(policy).toContain("geolocation=()");
    expect(policy).toContain("payment=()");
  });

  it("sets Cross-Origin-Opener-Policy and Cross-Origin-Resource-Policy", () => {
    const headers = buildSecurityHeaders({ nonce: "n" });
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(headers["Cross-Origin-Resource-Policy"]).toBe("same-origin");
  });

  it("uses a fresh nonce per call site (caller-supplied, never reused)", () => {
    const headersA = buildSecurityHeaders({ nonce: "nonce-a" });
    const headersB = buildSecurityHeaders({ nonce: "nonce-b" });
    expect(headersA["Content-Security-Policy"]).toContain("nonce-a");
    expect(headersB["Content-Security-Policy"]).toContain("nonce-b");
  });
});

describe("generateNonce", () => {
  it("generates a different value every call", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});
