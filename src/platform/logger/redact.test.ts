import { describe, expect, it } from "vitest";
import { redact } from "./redact";

/** MET-SEC-* requires a test asserting no secret ever appears in emitted logs (OBSERVABILITY.md §2). */
describe("redact", () => {
  const DENYLISTED_FIXTURE = {
    password: "hunter2",
    token: "abc123",
    cookie: "sid=xyz",
    authorization: "Bearer abc",
    mfaSecret: "JBSWY3DPEHPK3PXP",
    sessionId: "sess-1",
    email: "user@example.test",
  };

  it("redacts every denylisted top-level field", () => {
    const result = redact(DENYLISTED_FIXTURE) as Record<string, unknown>;
    for (const key of Object.keys(DENYLISTED_FIXTURE)) {
      expect(result[key]).toBe("[REDACTED]");
    }
  });

  it("redacts denylisted fields at arbitrary nesting depth", () => {
    const nested = { request: { headers: { authorization: "Bearer abc" } } };
    const result = redact(nested) as {
      request: { headers: { authorization: string } };
    };
    expect(result.request.headers.authorization).toBe("[REDACTED]");
  });

  it("redacts denylisted fields inside arrays", () => {
    const withArray = { events: [{ token: "abc" }, { token: "def" }] };
    const result = redact(withArray) as { events: { token: string }[] };
    expect(result.events.every((e) => e.token === "[REDACTED]")).toBe(true);
  });

  it("is case-insensitive on the key name", () => {
    const result = redact({ PASSWORD: "x", Token: "y" }) as Record<string, unknown>;
    expect(result.PASSWORD).toBe("[REDACTED]");
    expect(result.Token).toBe("[REDACTED]");
  });

  it("leaves non-denylisted fields untouched", () => {
    const result = redact({ requestId: "req-1", route: "/api/v1/bets", durationMs: 12 }) as Record<
      string,
      unknown
    >;
    expect(result).toEqual({ requestId: "req-1", route: "/api/v1/bets", durationMs: 12 });
  });

  it("never throws on a circular structure", () => {
    const circular: Record<string, unknown> = { name: "x" };
    circular.self = circular;
    expect(() => redact(circular)).not.toThrow();
  });
});
