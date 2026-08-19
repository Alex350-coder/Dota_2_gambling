import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { DomainError } from "@/domain/errors";

export interface ErrorResponseBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
    readonly requestId: string;
  };
}

const GENERIC_INTERNAL_ERROR_MESSAGE = "an unexpected error occurred";

/**
 * Single response-mapping boundary (T-318) used by every route handler's
 * catch block. Never forwards `error.message`/`cause`/stack for anything that
 * isn't already a `DomainError` — those are the only messages the domain has
 * vetted as safe to show a client (Claude/ErrorHandling.md §1).
 */
export function toErrorResponse(
  error: unknown,
  requestId: string = randomUUID(),
): NextResponse<ErrorResponseBody> {
  const domainError =
    error instanceof DomainError
      ? error
      : new DomainError("INTERNAL_ERROR", GENERIC_INTERNAL_ERROR_MESSAGE);

  return NextResponse.json(
    {
      error: {
        code: domainError.code,
        message: domainError.message,
        ...(domainError.details ? { details: domainError.details } : {}),
        requestId,
      },
    },
    { status: domainError.httpStatus },
  );
}
