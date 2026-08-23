import type { ZodType } from "zod";
import { DomainError } from "@/domain/errors";

/**
 * Parses and validates a request body against a `.strict()` schema (Validation.md).
 * Malformed JSON and schema violations both become VALIDATION_FAILED (422), never
 * an uncaught exception that would fall through to the generic 500 mapping.
 */
export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new DomainError("VALIDATION_FAILED", "request body must be valid JSON");
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new DomainError("VALIDATION_FAILED", "request body failed validation", {
      details: { issues: result.error.issues.map((issue) => issue.path.join(".")) },
    });
  }
  return result.data;
}

/**
 * Parses and validates a request's query string against a `.strict()` schema
 * (Validation.md) — the GET-request counterpart to `parseJsonBody`.
 */
export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  const raw = Object.fromEntries(new URL(request.url).searchParams);
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new DomainError("VALIDATION_FAILED", "query parameters failed validation", {
      details: { issues: result.error.issues.map((issue) => issue.path.join(".")) },
    });
  }
  return result.data;
}
