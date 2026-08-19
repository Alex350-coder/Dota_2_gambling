import { describe, expect, it } from "vitest";
import { serializeExpiredSessionCookie, serializeSessionCookie } from "./cookie";

describe("serializeSessionCookie", () => {
  it("includes the exact attribute set required by Security.md §5", () => {
    const cookie = serializeSessionCookie("opaque-token-value", {
      name: "sid",
      maxAgeSeconds: 2_592_000,
    });

    const attributes = cookie.split("; ");
    expect(attributes).toContain("Path=/");
    expect(attributes).toContain("HttpOnly");
    expect(attributes).toContain("Secure");
    expect(attributes).toContain("SameSite=Lax");
    expect(attributes).toContain("Max-Age=2592000");
    expect(attributes[0]).toBe("sid=opaque-token-value");
  });

  it("uses the configured cookie name", () => {
    const cookie = serializeSessionCookie("token", { name: "custom_session", maxAgeSeconds: 60 });

    expect(cookie.startsWith("custom_session=token;")).toBe(true);
  });
});

describe("serializeExpiredSessionCookie", () => {
  it("clears the cookie value and sets Max-Age=0", () => {
    const cookie = serializeExpiredSessionCookie("sid");

    const attributes = cookie.split("; ");
    expect(attributes[0]).toBe("sid=");
    expect(attributes).toContain("Max-Age=0");
    expect(attributes).toContain("HttpOnly");
    expect(attributes).toContain("Secure");
    expect(attributes).toContain("SameSite=Lax");
  });
});
