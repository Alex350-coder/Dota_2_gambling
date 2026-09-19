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

    return rows.map(toState);
  }

  async listAll(): Promise<RgLimitState[]> {
    const rows = await this.tx.select().from(rgLimits).where(eq(rgLimits.userId, this.ownerId));

    return rows.map(toState);
  }

  async upsert(state: RgLimitState): Promise<void> {
    await this.tx
      .insert(rgLimits)
      .values({
        userId: this.ownerId,
        kind: state.kind,
        period: state.period,
        currentValue: state.currentValue,
        pendingValue: state.pendingValue,
        effectiveAt: state.effectiveAt,
      })
      .onConflictDoUpdate({
        target: [rgLimits.userId, rgLimits.kind, rgLimits.period],
        set: {
          currentValue: state.currentValue,
          pendingValue: state.pendingValue,
          effectiveAt: state.effectiveAt,
          updatedAt: new Date(),
        },
      });
  }
}

function toState(row: {
  kind: LimitKind;
  period: RgLimitState["period"];
  currentValue: bigint;
  pendingValue: bigint | null;
  effectiveAt: Date | null;
}): RgLimitState {
  return {
    kind: row.kind,
    period: row.period,
    currentValue: row.currentValue,
    pendingValue: row.pendingValue,
    effectiveAt: row.effectiveAt,
  };
}
