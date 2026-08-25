import { and, eq } from "drizzle-orm";
import type {
  CreateIdempotencyKeyInput,
  IdempotencyKeyRecord,
  IdempotencyKeyRepository,
} from "@/domain/ports";
import { idempotencyKeys } from "../schema/platform";
import type { DbTx } from "../uow";

/**
 * `tryCreate` relies on the table's `(user_id, route, key)` primary key: a concurrent duplicate
 * loses the `ON CONFLICT DO NOTHING` race and gets zero rows back instead of a catchable error,
 * so callers never need the UoW's retryable-SQLSTATE machinery for this table.
 */
export class DrizzleIdempotencyKeyRepository implements IdempotencyKeyRepository {
  constructor(private readonly tx: DbTx) {}

  async tryCreate(input: CreateIdempotencyKeyInput): Promise<boolean> {
    const inserted = await this.tx
      .insert(idempotencyKeys)
      .values({
        userId: input.userId,
        route: input.route,
        key: input.key,
        requestHash: input.requestHash,
      })
      .onConflictDoNothing()
      .returning({ userId: idempotencyKeys.userId });

    return inserted.length > 0;
  }

  async findByKey(
    userId: string,
    route: string,
    key: string,
  ): Promise<IdempotencyKeyRecord | null> {
    const [row] = await this.tx
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.userId, userId),
          eq(idempotencyKeys.route, route),
          eq(idempotencyKeys.key, key),
        ),
      );

    if (!row) {
      return null;
    }

    return {
      userId: row.userId,
      route: row.route,
      key: row.key,
      requestHash: row.requestHash,
      responseStatus: row.responseStatus,
      responseBody: row.responseBody,
      createdAt: row.createdAt,
    };
  }

  async updateResponse(
    userId: string,
    route: string,
    key: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void> {
    await this.tx
      .update(idempotencyKeys)
      .set({ responseStatus, responseBody })
      .where(
        and(
          eq(idempotencyKeys.userId, userId),
          eq(idempotencyKeys.route, route),
          eq(idempotencyKeys.key, key),
        ),
      );
  }
}
