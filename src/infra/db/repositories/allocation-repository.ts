import { alias } from "drizzle-orm/pg-core";
import { and, asc, count, eq, or, sql } from "drizzle-orm";
import type {
  AllocationCountsByStatus,
  AllocationRepository,
  CreateMatchAllocationInput,
  MatchAllocation,
} from "@/domain/ports";
import type { MatchAllocationStatus } from "@/domain/settlement";
import { betOrders, matchAllocations } from "../schema/betting";
import type { DbTx } from "../uow";

/**
 * `match_allocations` has no `user_id` column, so ownership is resolved by joining through
 * `bet_orders` on both sides of the pair and filtering `WHERE bet_orders.user_id = ownerId`.
 */
export class DrizzleAllocationRepository implements AllocationRepository {
  constructor(
    private readonly tx: DbTx,
    private readonly ownerId: string,
  ) {}

  async findByOrderId(orderId: string): Promise<readonly MatchAllocation[]> {
    const orderA = alias(betOrders, "order_a");
    const orderB = alias(betOrders, "order_b");

    const rows = await this.tx
      .select({ allocation: matchAllocations })
      .from(matchAllocations)
      .innerJoin(orderA, eq(matchAllocations.orderAId, orderA.id))
      .innerJoin(orderB, eq(matchAllocations.orderBId, orderB.id))
      .where(
        and(
          or(eq(matchAllocations.orderAId, orderId), eq(matchAllocations.orderBId, orderId)),
          or(eq(orderA.userId, this.ownerId), eq(orderB.userId, this.ownerId)),
        ),
      );

    return rows.map(({ allocation }) => ({
      id: allocation.id,
      marketId: allocation.marketId,
      orderAId: allocation.orderAId,
      orderBId: allocation.orderBId,
      sequence: allocation.sequence,
      matchedMinor: allocation.matchedMinor,
      status: allocation.status,
      createdAt: allocation.createdAt,
      updatedAt: allocation.updatedAt,
    }));
  }

  async create(input: CreateMatchAllocationInput): Promise<MatchAllocation> {
    const [row] = await this.tx
      .insert(matchAllocations)
      .values({
        id: input.id,
        marketId: input.marketId,
        orderAId: input.orderAId,
        orderBId: input.orderBId,
        sequence: input.sequence,
        matchedMinor: input.matchedMinor,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      })
      .returning();

    if (!row) {
      throw new Error("match allocation insert returned no row");
    }

    return {
      id: row.id,
      marketId: row.marketId,
      orderAId: row.orderAId,
      orderBId: row.orderBId,
      sequence: row.sequence,
      matchedMinor: row.matchedMinor,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async nextSequence(marketId: string): Promise<bigint> {
    const [row] = await this.tx
      .select({ max: sql<string | null>`max(${matchAllocations.sequence})` })
      .from(matchAllocations)
      .where(eq(matchAllocations.marketId, marketId));

    const current = row?.max === null || row?.max === undefined ? 0n : BigInt(row.max);
    return current + 1n;
  }

  async listActiveByMarketId(marketId: string): Promise<readonly MatchAllocation[]> {
    const rows = await this.tx
      .select()
      .from(matchAllocations)
      .where(and(eq(matchAllocations.marketId, marketId), eq(matchAllocations.status, "ACTIVE")))
      .orderBy(asc(matchAllocations.sequence));

    return rows.map((row) => this.toMatchAllocation(row));
  }

  async updateStatus(id: string, status: MatchAllocationStatus): Promise<MatchAllocation | null> {
    const [row] = await this.tx
      .update(matchAllocations)
      .set({ status })
      .where(and(eq(matchAllocations.id, id), eq(matchAllocations.status, "ACTIVE")))
      .returning();

    return row ? this.toMatchAllocation(row) : null;
  }

  async countByStatus(marketId: string): Promise<AllocationCountsByStatus> {
    const rows = await this.tx
      .select({ status: matchAllocations.status, total: count() })
      .from(matchAllocations)
      .where(eq(matchAllocations.marketId, marketId))
      .groupBy(matchAllocations.status);

    const counts: { -readonly [K in keyof AllocationCountsByStatus]: number } = {
      active: 0,
      settled: 0,
      voided: 0,
    };
    for (const row of rows) {
      if (row.status === "ACTIVE") counts.active = row.total;
      else if (row.status === "SETTLED") counts.settled = row.total;
      else counts.voided = row.total;
    }
    return counts;
  }

  private toMatchAllocation(row: typeof matchAllocations.$inferSelect): MatchAllocation {
    return {
      id: row.id,
      marketId: row.marketId,
      orderAId: row.orderAId,
      orderBId: row.orderBId,
      sequence: row.sequence,
      matchedMinor: row.matchedMinor,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
