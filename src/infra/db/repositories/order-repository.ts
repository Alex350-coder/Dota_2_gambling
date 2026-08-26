import { and, eq } from "drizzle-orm";
import type { BetOrder } from "@/domain/betting";
import type { BetOrderRepository, CreateBetOrderInput } from "@/domain/ports";
import { DomainError } from "@/domain/errors";
import { toMinor } from "@/domain/money";
import { betOrders } from "../schema/betting";
import type { DbTx } from "../uow";

/** Owner-scoped at construction — every read/write is filtered by `user_id = ownerId`. */
export class DrizzleOrderRepository implements BetOrderRepository {
  constructor(
    private readonly tx: DbTx,
    private readonly ownerId: string,
  ) {}

  async create(input: CreateBetOrderInput): Promise<BetOrder> {
    if (input.userId !== this.ownerId) {
      throw new DomainError(
        "UNAUTHORIZED_OPERATION",
        "cannot create a bet order owned by a different user",
        { details: { ownerId: this.ownerId, entityUserId: input.userId } },
      );
    }

    const [row] = await this.tx
      .insert(betOrders)
      .values({
        id: input.id,
        betSlipId: input.betSlipId,
        userId: input.userId,
        marketId: input.marketId,
        outcomeId: input.outcomeId,
        currency: input.currency,
        requestedMinor: input.requestedMinor,
        matchedMinor: input.matchedMinor,
        unmatchedMinor: input.unmatchedMinor,
        releasedMinor: input.releasedMinor,
        oddsNum: input.oddsNum,
        oddsDen: input.oddsDen,
        commissionBps: input.commissionBps,
        status: input.status,
        idempotencyKey: input.idempotencyKey,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      })
      .returning();

    if (!row) {
      throw new Error("bet order insert returned no row");
    }

    return this.toBetOrder(row);
  }

  /** `FOR UPDATE`: every current caller loads an order immediately before mutating it. */
  async findById(id: string): Promise<BetOrder | null> {
    const [row] = await this.tx
      .select()
      .from(betOrders)
      .where(and(eq(betOrders.id, id), eq(betOrders.userId, this.ownerId)))
      .for("update");

    return row ? this.toBetOrder(row) : null;
  }

  async save(entity: BetOrder): Promise<void> {
    if (entity.userId !== this.ownerId) {
      throw new DomainError(
        "UNAUTHORIZED_OPERATION",
        "cannot save a bet order owned by a different user",
        { details: { orderId: entity.id, ownerId: this.ownerId, entityUserId: entity.userId } },
      );
    }

    const updated = await this.tx
      .update(betOrders)
      .set({
        matchedMinor: entity.matchedMinor,
        unmatchedMinor: entity.unmatchedMinor,
        releasedMinor: entity.releasedMinor,
        status: entity.status,
        updatedAt: entity.updatedAt,
      })
      .where(and(eq(betOrders.id, entity.id), eq(betOrders.userId, this.ownerId)))
      .returning({ id: betOrders.id });

    if (updated.length === 0) {
      throw new DomainError("RESOURCE_NOT_FOUND", "bet order not found for this owner", {
        details: { orderId: entity.id, ownerId: this.ownerId },
      });
    }
  }

  private toBetOrder(row: typeof betOrders.$inferSelect): BetOrder {
    return {
      id: row.id,
      userId: row.userId,
      marketId: row.marketId,
      outcomeId: row.outcomeId,
      requestedMinor: toMinor(row.requestedMinor),
      matchedMinor: toMinor(row.matchedMinor),
      unmatchedMinor: toMinor(row.unmatchedMinor),
      releasedMinor: toMinor(row.releasedMinor),
      oddsNum: row.oddsNum,
      oddsDen: row.oddsDen,
      commissionBps: row.commissionBps,
      status: row.status,
      idempotencyKey: row.idempotencyKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
