import { createHash } from "node:crypto";
import { DomainError } from "@/domain/errors";
import type { IdempotencyKeyRepository } from "@/domain/ports";

export interface IdempotencyRequest {
  readonly userId: string;
  readonly route: string;
  readonly idempotencyKey: string;
  readonly requestBody: unknown;
}

function hashRequestBody(requestBody: unknown): string {
  return createHash("sha256").update(JSON.stringify(requestBody)).digest("hex");
}

/**
 * Wraps a financial mutation with idempotency-by-key semantics (RULE-G05), run inside the
 * same DB transaction as `handler` so a racing duplicate serializes on the table's own
 * primary key instead of two callers racing a SELECT-then-INSERT.
 *
 * `tryCreate` losing the race means either: (a) a genuinely concurrent in-flight duplicate
 * that hasn't committed its response yet (`responseStatus` still null) -> SERVICE_BUSY, so the
 * caller retries shortly; or (b) an already-completed prior attempt -> replay its response if
 * the request hash matches, else IDEMPOTENCY_KEY_REUSE (the same key was reused for a
 * different payload).
 *
 * Only successful completions are cached: if `handler` throws, the whole transaction —
 * including the `tryCreate` insert — rolls back, so a failed attempt is never cached and a
 * retry starts fresh.
 */
export async function withIdempotency<T>(
  repo: IdempotencyKeyRepository,
  request: IdempotencyRequest,
  handler: () => Promise<{ status: number; body: T }>,
): Promise<{ status: number; body: T }> {
  const requestHash = hashRequestBody(request.requestBody);
  const won = await repo.tryCreate({
    userId: request.userId,
    route: request.route,
    key: request.idempotencyKey,
    requestHash,
  });

  if (won) {
    const result = await handler();
    await repo.updateResponse(
      request.userId,
      request.route,
      request.idempotencyKey,
      result.status,
      result.body,
    );
    return result;
  }

  const existing = await repo.findByKey(request.userId, request.route, request.idempotencyKey);
  if (!existing) {
    throw new DomainError("SERVICE_BUSY", "idempotency key lookup raced with its own insert");
  }

  if (existing.requestHash !== requestHash) {
    throw new DomainError(
      "IDEMPOTENCY_KEY_REUSE",
      "idempotency key was already used with a different request body",
      { details: { route: request.route, key: request.idempotencyKey } },
    );
  }

  if (existing.responseStatus === null) {
    throw new DomainError(
      "SERVICE_BUSY",
      "a concurrent request with the same idempotency key is still in flight",
    );
  }

  return { status: existing.responseStatus, body: existing.responseBody as T };
}
