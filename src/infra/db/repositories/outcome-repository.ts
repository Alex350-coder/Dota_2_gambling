import { eq } from "drizzle-orm";
import type { CreateOutcomeInput, Outcome, OutcomeRepository } from "@/domain/ports";
import { outcomes } from "../schema/catalog";
import type { DbTx } from "../uow";

/** `outcomes` is set once at market creation and never mutated afterwards. */
export class DrizzleOutcomeRepository implements OutcomeRepository {
  constructor(private readonly tx: DbTx) {}

  async create(input: CreateOutcomeInput): Promise<Outcome> {
    const [row] = await this.tx
      .insert(outcomes)
      .values({
        id: input.id,
        marketId: input.marketId,
        code: input.code,
        label: input.label,
      })
      .returning();

    if (!row) {
      throw new Error("insert into outcomes returned no row");
    }
    return this.toOutcome(row);
  }

  async listByMarketId(marketId: string): Promise<Outcome[]> {
    const rows = await this.tx.select().from(outcomes).where(eq(outcomes.marketId, marketId));
    return rows.map((row) => this.toOutcome(row));
  }

  private toOutcome(row: typeof outcomes.$inferSelect): Outcome {
    return {
      id: row.id,
      marketId: row.marketId,
      code: row.code,
      label: row.label,
      createdAt: row.createdAt,
    };
  }
}
