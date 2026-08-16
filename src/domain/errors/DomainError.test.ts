import { describe, expect, it } from "vitest";
import { DomainError } from "./DomainError";

describe("DomainError", () => {
  it("carries the code, httpStatus and retryable derived from the code taxonomy", () => {
    const error = new DomainError("INVALID_STATE_TRANSITION", "cannot cancel a matched order");

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("INVALID_STATE_TRANSITION");
    expect(error.httpStatus).toBe(409);
    expect(error.retryable).toBe(false);
    expect(error.message).toBe("cannot cancel a matched order");
  });

  it("derives retryable=true for retry-eligible platform codes", () => {
    const error = new DomainError("SERVICE_BUSY", "lock contention");

    expect(error.retryable).toBe(true);
    expect(error.httpStatus).toBe(503);
  });

  it("accepts optional safe-to-expose details", () => {
    const error = new DomainError("VALIDATION_FAILED", "invalid stake", {
      details: { field: "stakeMinor", reason: "STAKE_BELOW_MINIMUM" },
    });

    expect(error.details).toEqual({ field: "stakeMinor", reason: "STAKE_BELOW_MINIMUM" });
  });

  it("accepts an optional cause that is never part of the public message", () => {
    const cause = new Error("raw driver error");
    const error = new DomainError("INTERNAL_ERROR", "unexpected failure", { cause });

    expect(error.cause).toBe(cause);
    expect(error.message).not.toContain("raw driver error");
  });

  it("has undefined details and cause when not provided", () => {
    const error = new DomainError("RESOURCE_NOT_FOUND", "not found");

    expect(error.details).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it("sets the error name to DomainError", () => {
    const error = new DomainError("UNAUTHENTICATED", "no session");

    expect(error.name).toBe("DomainError");
  });
});
