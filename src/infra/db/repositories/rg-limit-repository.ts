import { and, eq } from "drizzle-orm";
import type { LimitKind, RgLimitState } from "@/domain/compliance";
import type { RgLimitRepository } from "@/domain/ports";
import { rgLimits } from "../schema/compliance";
import type { DbTx } from "../uow";

/** Owner-scoped at construction — every query filters `WHERE user_id = ownerId` (RULE-D-owner). */
export class DrizzleRgLimitRepository implements RgLimitRepository {
  constructor(
    private readonly tx: DbTx,
    private readonly ownerId: string,
  ) {}

  async listByKind(kind: LimitKind): Promise<RgLimitState[]> {
    const rows = await this.tx
      .select()
      .from(rgLimits)
      .where(and(eq(rgLimits.userId, this.ownerId), eq(rgLimits.kind, kind)));

    return rows.map((row) => ({
      kind: row.kind,
      period: row.period,
      currentValue: row.currentValue,
      pendingValue: row.pendingValue,
      effectiveAt: row.effectiveAt,
    }));
  }
}
