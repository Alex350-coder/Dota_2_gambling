import { describe, expect, it } from "vitest";
import { ERROR_CODE_META, type ErrorCode } from "./codes";

const EXPECTED_CODES: readonly ErrorCode[] = [
  "UNAUTHENTICATED",
  "UNAUTHORIZED_OPERATION",
  "ACCOUNT_SUSPENDED",
  "ACCOUNT_SELF_EXCLUDED",
  "AGE_REQUIREMENT_NOT_MET",
  "MFA_REQUIRED",
  "MFA_INVALID_CODE",
  "SESSION_EXPIRED",
  "VALIDATION_FAILED",
  "INVALID_OUTCOME",
  "UNSUPPORTED_MARKET_MODEL",
  "STAKE_BELOW_MINIMUM",
  "STAKE_ABOVE_MAXIMUM",
  "CURRENCY_MISMATCH",
  "MARKET_CLOSED",
  "MARKET_SUSPENDED",
  "MARKET_NOT_SETTLEABLE",
  "BET_NOT_MATCHABLE",
  "BET_NOT_CANCELLABLE",
  "SELF_MATCH_FORBIDDEN",
  "INVALID_STATE_TRANSITION",
  "STALE_STATE",
  "INSUFFICIENT_FUNDS",
  "ALREADY_SETTLED",
  "DUPLICATE_REQUEST",
  "IDEMPOTENCY_KEY_REUSE",
  "RESULT_NOT_CONFIRMED",
  "LIMIT_EXCEEDED",
  "WITHDRAWAL_NOT_ALLOWED",
  "MONEY_MODE_FORBIDDEN",
  "RATE_LIMITED",
  "SERVICE_BUSY",
  "RESOURCE_NOT_FOUND",
  "INTERNAL_ERROR",
  "DEPENDENCY_UNAVAILABLE",
];

describe("ERROR_CODE_META", () => {
  it("has metadata for every documented error code, per ErrorHandling.md §2", () => {
    expect(Object.keys(ERROR_CODE_META).sort()).toEqual([...EXPECTED_CODES].sort());
  });

  it.each(EXPECTED_CODES)("%s has a valid httpStatus and boolean retryable", (code) => {
    const meta = ERROR_CODE_META[code];

    expect(meta.httpStatus).toBeGreaterThanOrEqual(400);
    expect(typeof meta.retryable).toBe("boolean");
  });

  it("marks only the platform retry-eligible codes as retryable", () => {
    const retryable = Object.entries(ERROR_CODE_META)
      .filter(([, meta]) => meta.retryable)
      .map(([code]) => code)
      .sort();

    expect(retryable).toEqual(["DEPENDENCY_UNAVAILABLE", "RATE_LIMITED", "SERVICE_BUSY"].sort());
  });

  it("maps INVALID_STATE_TRANSITION to 409", () => {
    expect(ERROR_CODE_META.INVALID_STATE_TRANSITION.httpStatus).toBe(409);
  });

  it("maps INSUFFICIENT_FUNDS to 409", () => {
    expect(ERROR_CODE_META.INSUFFICIENT_FUNDS.httpStatus).toBe(409);
  });

  it("maps INTERNAL_ERROR to 500 and not retryable", () => {
    expect(ERROR_CODE_META.INTERNAL_ERROR).toEqual({ httpStatus: 500, retryable: false });
  });
});
