/**
 * Error code taxonomy. Source of truth: Claude/ErrorHandling.md §2.
 * Each code carries its HTTP mapping and whether the operation is safely
 * retryable, so adapters never have to re-derive this from prose.
 */
export type ErrorCode =
  // Authentication & authorization
  | "UNAUTHENTICATED"
  | "UNAUTHORIZED_OPERATION"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_SELF_EXCLUDED"
  | "AGE_REQUIREMENT_NOT_MET"
  | "MFA_REQUIRED"
  | "SESSION_EXPIRED"
  // Validation
  | "VALIDATION_FAILED"
  | "INVALID_OUTCOME"
  | "UNSUPPORTED_MARKET_MODEL"
  | "STAKE_BELOW_MINIMUM"
  | "STAKE_ABOVE_MAXIMUM"
  | "CURRENCY_MISMATCH"
  // Betting & market
  | "MARKET_CLOSED"
  | "MARKET_SUSPENDED"
  | "MARKET_NOT_SETTLEABLE"
  | "BET_NOT_MATCHABLE"
  | "BET_NOT_CANCELLABLE"
  | "SELF_MATCH_FORBIDDEN"
  | "INVALID_STATE_TRANSITION"
  | "STALE_STATE"
  // Money
  | "INSUFFICIENT_FUNDS"
  | "ALREADY_SETTLED"
  | "DUPLICATE_REQUEST"
  | "IDEMPOTENCY_KEY_REUSE"
  | "RESULT_NOT_CONFIRMED"
  | "LIMIT_EXCEEDED"
  | "WITHDRAWAL_NOT_ALLOWED"
  | "MONEY_MODE_FORBIDDEN"
  // Platform
  | "RATE_LIMITED"
  | "SERVICE_BUSY"
  | "RESOURCE_NOT_FOUND"
  | "INTERNAL_ERROR"
  | "DEPENDENCY_UNAVAILABLE";

export interface ErrorCodeMeta {
  readonly httpStatus: number;
  readonly retryable: boolean;
}

export const ERROR_CODE_META: Readonly<Record<ErrorCode, ErrorCodeMeta>> = {
  UNAUTHENTICATED: { httpStatus: 401, retryable: false },
  UNAUTHORIZED_OPERATION: { httpStatus: 403, retryable: false },
  ACCOUNT_SUSPENDED: { httpStatus: 403, retryable: false },
  ACCOUNT_SELF_EXCLUDED: { httpStatus: 403, retryable: false },
  AGE_REQUIREMENT_NOT_MET: { httpStatus: 403, retryable: false },
  MFA_REQUIRED: { httpStatus: 401, retryable: false },
  SESSION_EXPIRED: { httpStatus: 401, retryable: false },

  VALIDATION_FAILED: { httpStatus: 422, retryable: false },
  INVALID_OUTCOME: { httpStatus: 422, retryable: false },
  UNSUPPORTED_MARKET_MODEL: { httpStatus: 422, retryable: false },
  STAKE_BELOW_MINIMUM: { httpStatus: 422, retryable: false },
  STAKE_ABOVE_MAXIMUM: { httpStatus: 422, retryable: false },
  CURRENCY_MISMATCH: { httpStatus: 422, retryable: false },

  MARKET_CLOSED: { httpStatus: 409, retryable: false },
  MARKET_SUSPENDED: { httpStatus: 409, retryable: false },
  MARKET_NOT_SETTLEABLE: { httpStatus: 409, retryable: false },
  BET_NOT_MATCHABLE: { httpStatus: 409, retryable: false },
  BET_NOT_CANCELLABLE: { httpStatus: 409, retryable: false },
  SELF_MATCH_FORBIDDEN: { httpStatus: 409, retryable: false },
  INVALID_STATE_TRANSITION: { httpStatus: 409, retryable: false },
  STALE_STATE: { httpStatus: 409, retryable: false },

  INSUFFICIENT_FUNDS: { httpStatus: 409, retryable: false },
  ALREADY_SETTLED: { httpStatus: 409, retryable: false },
  DUPLICATE_REQUEST: { httpStatus: 409, retryable: false },
  IDEMPOTENCY_KEY_REUSE: { httpStatus: 409, retryable: false },
  RESULT_NOT_CONFIRMED: { httpStatus: 409, retryable: false },
  LIMIT_EXCEEDED: { httpStatus: 409, retryable: false },
  WITHDRAWAL_NOT_ALLOWED: { httpStatus: 409, retryable: false },
  MONEY_MODE_FORBIDDEN: { httpStatus: 403, retryable: false },

  RATE_LIMITED: { httpStatus: 429, retryable: true },
  SERVICE_BUSY: { httpStatus: 503, retryable: true },
  RESOURCE_NOT_FOUND: { httpStatus: 404, retryable: false },
  INTERNAL_ERROR: { httpStatus: 500, retryable: false },
  DEPENDENCY_UNAVAILABLE: { httpStatus: 502, retryable: true },
};
