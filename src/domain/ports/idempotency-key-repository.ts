export interface IdempotencyKeyRecord {
  readonly userId: string;
  readonly route: string;
  readonly key: string;
  readonly requestHash: string;
  readonly responseStatus: number | null;
  readonly responseBody: unknown;
  readonly createdAt: Date;
}

export interface CreateIdempotencyKeyInput {
  readonly userId: string;
  readonly route: string;
  readonly key: string;
  readonly requestHash: string;
}

/**
 * Backs the `Idempotency-Key` header contract for financial mutations (RULE-G05),
 * reusing the `idempotency_keys` table from T-210. `tryCreate` is the race-safe entry
 * point: it inserts only if no row exists yet for (userId, route, key) and reports
 * whether *this* call won the race, so a concurrent duplicate blocks on the DB's own
 * unique-index conflict check instead of two callers racing a SELECT-then-INSERT.
 */
export interface IdempotencyKeyRepository {
  tryCreate(input: CreateIdempotencyKeyInput): Promise<boolean>;
  findByKey(userId: string, route: string, key: string): Promise<IdempotencyKeyRecord | null>;
  updateResponse(
    userId: string,
    route: string,
    key: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void>;
}
