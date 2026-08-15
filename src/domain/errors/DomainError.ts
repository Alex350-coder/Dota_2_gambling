import { ERROR_CODE_META, type ErrorCode } from "./codes";

export interface DomainErrorOptions {
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

/**
 * The only error type domain code may throw. Never a bare Error, never a
 * string. See Claude/ErrorHandling.md §1. `cause` is intentionally never
 * read by client-facing code paths; it exists for server-side logging only.
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details: Record<string, unknown> | undefined;
  readonly retryable: boolean;
  override readonly cause: unknown;

  constructor(code: ErrorCode, message: string, options?: DomainErrorOptions) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    const meta = ERROR_CODE_META[code];
    this.httpStatus = meta.httpStatus;
    this.retryable = meta.retryable;
    this.details = options?.details;
    this.cause = options?.cause;
  }
}
