import { DomainError } from "@/domain/errors";
import type { DbTx } from "@/infra/db";
import { DrizzleIdempotencyKeyRepository } from "@/infra/db";
import type { IdempotencyKeyRepository, UnitOfWork } from "@/domain/ports";
import { withIdempotency } from "@/application/shared";

export interface IdempotentRouteDeps {
  readonly uow: UnitOfWork<DbTx>;
}

/**
 * `withIdempotency`'s own `handler` (placement, cancellation, ...) already opens its own
 * `uow.run` transaction, and `DrizzleUnitOfWork.run` isn't reentrant-safe on a shared `db`
 * instance — so this repository adapter runs each idempotency-table operation in its own
 * short transaction rather than sharing one with `handler`. Financial atomicity is guaranteed
 * elsewhere (the use case's own transaction plus the ledger's idempotency key on the write
 * itself); this table only caches the HTTP response for exact-retry replay.
 */
function perCallTxRepository(uow: UnitOfWork<DbTx>): IdempotencyKeyRepository {
  return {
    tryCreate: (input) => uow.run((tx) => new DrizzleIdempotencyKeyRepository(tx).tryCreate(input)),
    findByKey: (userId, route, key) =>
      uow.run((tx) => new DrizzleIdempotencyKeyRepository(tx).findByKey(userId, route, key)),
    updateResponse: (userId, route, key, responseStatus, responseBody) =>
      uow.run((tx) =>
        new DrizzleIdempotencyKeyRepository(tx).updateResponse(
          userId,
          route,
          key,
          responseStatus,
          responseBody,
        ),
      ),
  };
}

/** Missing `Idempotency-Key` header on a financial route -> `VALIDATION_FAILED` (RULE-G05). */
export function requireIdempotencyKey(request: Request): string {
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    throw new DomainError("VALIDATION_FAILED", "Idempotency-Key header is required");
  }
  return idempotencyKey;
}

/**
 * Reads the required `Idempotency-Key` header (RULE-G05) for a financial route and wraps
 * `handler` with idempotency-by-key replay semantics.
 */
export async function withHttpIdempotency<T>(
  deps: IdempotentRouteDeps,
  input: {
    readonly request: Request;
    readonly userId: string;
    readonly route: string;
    readonly requestBody: unknown;
  },
  handler: () => Promise<{ status: number; body: T }>,
): Promise<{ status: number; body: T }> {
  return withIdempotency(
    perCallTxRepository(deps.uow),
    {
      userId: input.userId,
      route: input.route,
      idempotencyKey: requireIdempotencyKey(input.request),
      requestBody: input.requestBody,
    },
    handler,
  );
}
