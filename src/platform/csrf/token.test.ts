import { describe, expect, it } from "vitest";
import { generateCsrfToken, verifyCsrf } from "./token";

describe("generateCsrfToken", () => {
  it("generates a high-entropy, url-safe token", () => {
    const token = generateCsrfToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates a different token every call", () => {
    expect(generateCsrfToken()).not.toBe(generateCsrfToken());
  });
});

describe("verifyCsrf", () => {
  const allowedOrigin = "https://app.example.test";

  it("accepts a matching cookie/header token pair with the expected origin", () => {
    const token = generateCsrfToken();
    expect(
      verifyCsrf({ cookieToken: token, headerToken: token, origin: allowedOrigin, allowedOrigin }),
    ).toBe(true);
  });

  it("rejects when the cookie token is missing", () => {
    const token = generateCsrfToken();
    expect(
      verifyCsrf({
        cookieToken: undefined,
        headerToken: token,
        origin: allowedOrigin,
        allowedOrigin,
      }),
    ).toBe(false);
  });

  it("rejects when the header token is missing", () => {
    const token = generateCsrfToken();
    expect(
      verifyCsrf({
        cookieToken: token,
        headerToken: undefined,
        origin: allowedOrigin,
        allowedOrigin,
      }),
    ).toBe(false);
  });

  it("rejects when the cookie and header tokens differ", () => {
    expect(
      verifyCsrf({
        cookieToken: generateCsrfToken(),
        headerToken: generateCsrfToken(),
        origin: allowedOrigin,
        allowedOrigin,
      }),
    ).toBe(false);
  });

  it("rejects when the Origin header is missing", () => {
    const token = generateCsrfToken();
    expect(
      verifyCsrf({ cookieToken: token, headerToken: token, origin: undefined, allowedOrigin }),
    ).toBe(false);
  });

  it("rejects when the Origin header does not match the allowed origin", () => {
    const token = generateCsrfToken();
    expect(
      verifyCsrf({
        cookieToken: token,
        headerToken: token,
        origin: "https://evil.test",
        allowedOrigin,
      }),
    ).toBe(false);
  });

  it("rejects tokens of different lengths without throwing", () => {
    expect(
      verifyCsrf({
        cookieToken: "short",
        headerToken: "a-much-longer-token-value",
        origin: allowedOrigin,
        allowedOrigin,
      }),
    ).toBe(false);
  });
});
