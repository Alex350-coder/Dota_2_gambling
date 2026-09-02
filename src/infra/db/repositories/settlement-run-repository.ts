import { desc, eq } from "drizzle-orm";
import type {
  SettlementRun,
  SettlementRunCompletionTotals,
  SettlementRunProgress,
  SettlementRunRepository,
  UpsertInProgressInput,
} from "@/domain/ports";
import { settlementRuns } from "../schema/settlement";
import type { DbTx } from "../uow";

export class DrizzleSettlementRunRepository implements SettlementRunRepository {
  constructor(private readonly tx: DbTx) {}

  async findByMarketId(marketId: string): Promise<SettlementRun | null> {
    const [row] = await this.tx
      .select()
      .from(settlementRuns)
      .where(eq(settlementRuns.marketId, marketId))
      .orderBy(desc(settlementRuns.startedAt))
      .limit(1);
    return row ? this.toSettlementRun(row) : null;
  }

  async findById(id: string): Promise<SettlementRun | null> {
    const [row] = await this.tx.select().from(settlementRuns).where(eq(settlementRuns.id, id));
    return row ? this.toSettlementRun(row) : null;
  }

  async upsertInProgress(input: UpsertInProgressInput): Promise<SettlementRun> {
    const existing = await this.findByMarketId(input.marketId);
    if (existing) {
      const [row] = await this.tx
        .update(settlementRuns)
        .set({ status: "IN_PROGRESS", startedAt: input.startedAt, finishedAt: null })
        .where(eq(settlementRuns.id, existing.id))
        .returning();
      if (!row) {
        throw new Error("update settlement_runs returned no row");
      }
      return this.toSettlementRun(row);
    }

    const [row] = await this.tx
      .insert(settlementRuns)
      .values({
        id: input.id,
        marketId: input.marketId,
        resultId: input.resultId,
        status: "IN_PROGRESS",
        startedAt: input.startedAt,
      })
      .returning();
    if (!row) {
      throw new Error("insert into settlement_runs returned no row");
    }
    return this.toSettlementRun(row);
  }

  async updateProgress(id: string, progress: SettlementRunProgress): Promise<SettlementRun> {
    const [row] = await this.tx
      .update(settlementRuns)
      .set({
        ...(progress.allocationsTotal !== undefined
          ? { allocationsTotal: progress.allocationsTotal }
          : {}),
        ...(progress.allocationsSettled !== undefined
          ? { allocationsSettled: progress.allocationsSettled }
          : {}),
      })
      .where(eq(settlementRuns.id, id))
      .returning();
    if (!row) {
      throw new Error("update settlement_runs returned no row");
    }
    return this.toSettlementRun(row);
  }

  async markCompleted(id: string, totals: SettlementRunCompletionTotals): Promise<SettlementRun> {
    const [row] = await this.tx
      .update(settlementRuns)
      .set({
        status: "COMPLETED",
        finishedAt: totals.finishedAt,
        allocationsSettled: totals.allocationsSettled,
        payoutTotalMinor: totals.payoutTotalMinor,
        commissionTotalMinor: totals.commissionTotalMinor,
        refundTotalMinor: totals.refundTotalMinor,
      })
      .where(eq(settlementRuns.id, id))
      .returning();
    if (!row) {
      throw new Error("update settlement_runs returned no row");
    }
    return this.toSettlementRun(row);
  }

  async markFailed(id: string, finishedAt: Date): Promise<SettlementRun> {
    const [row] = await this.tx
      .update(settlementRuns)
      .set({ status: "FAILED", finishedAt })
      .where(eq(settlementRuns.id, id))
      .returning();
    if (!row) {
      throw new Error("update settlement_runs returned no row");
    }
    return this.toSettlementRun(row);
  }

  private toSettlementRun(row: typeof settlementRuns.$inferSelect): SettlementRun {
    return {
      id: row.id,
      marketId: row.marketId,
      resultId: row.resultId,
      status: row.status,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      allocationsTotal: row.allocationsTotal,
      allocationsSettled: row.allocationsSettled,
      payoutTotalMinor: row.payoutTotalMinor,
      commissionTotalMinor: row.commissionTotalMinor,
      refundTotalMinor: row.refundTotalMinor,
    };
  }
}
