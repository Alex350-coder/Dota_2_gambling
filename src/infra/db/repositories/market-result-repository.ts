import { and, desc, eq, ne } from "drizzle-orm";
import type { CreateMarketResultInput, MarketResult, MarketResultRepository } from "@/domain/ports";
import type { MarketResultStatus } from "@/domain/settlement";
import { marketResults } from "../schema/settlement";
import type { DbTx } from "../uow";

/** `market_results` has no owner column — proposals/confirmations are admin-only, gated by authz, not ownership. */
export class DrizzleMarketResultRepository implements MarketResultRepository {
  constructor(private readonly tx: DbTx) {}

  async create(input: CreateMarketResultInput): Promise<MarketResult> {
    const [row] = await this.tx
      .insert(marketResults)
      .values({
        id: input.id,
        marketId: input.marketId,
        providerKey: input.providerKey,
        trustLevel: input.trustLevel,
        winningOutcomeId: input.winningOutcomeId,
        rawPayload: input.rawPayload,
        payloadHash: input.payloadHash,
        status: input.status,
        proposedBy: input.proposedBy,
        supersedesId: input.supersedesId ?? null,
        createdAt: input.createdAt,
      })
      .returning();

    if (!row) {
      throw new Error("insert into market_results returned no row");
    }
    return this.toMarketResult(row);
  }

  async findById(id: string): Promise<MarketResult | null> {
    const [row] = await this.tx.select().from(marketResults).where(eq(marketResults.id, id));
    return row ? this.toMarketResult(row) : null;
  }

  async findCurrentByMarketId(marketId: string): Promise<MarketResult | null> {
    const [row] = await this.tx
      .select()
      .from(marketResults)
      .where(and(eq(marketResults.marketId, marketId), ne(marketResults.status, "SUPERSEDED")))
      .orderBy(desc(marketResults.createdAt))
      .limit(1);
    return row ? this.toMarketResult(row) : null;
  }

  async findConfirmedByMarketId(marketId: string): Promise<MarketResult | null> {
    const [row] = await this.tx
      .select()
      .from(marketResults)
      .where(and(eq(marketResults.marketId, marketId), eq(marketResults.status, "CONFIRMED")));
    return row ? this.toMarketResult(row) : null;
  }

  async updateStatus(
    id: string,
    status: MarketResultStatus,
    fields?: { readonly confirmedBy?: string; readonly confirmedAt?: Date },
  ): Promise<MarketResult> {
    const [row] = await this.tx
      .update(marketResults)
      .set({
        status,
        ...(fields?.confirmedBy !== undefined ? { confirmedBy: fields.confirmedBy } : {}),
        ...(fields?.confirmedAt !== undefined ? { confirmedAt: fields.confirmedAt } : {}),
      })
      .where(eq(marketResults.id, id))
      .returning();

    if (!row) {
      throw new Error("update market_results returned no row");
    }
    return this.toMarketResult(row);
  }

  private toMarketResult(row: typeof marketResults.$inferSelect): MarketResult {
    return {
      id: row.id,
      marketId: row.marketId,
      providerKey: row.providerKey,
      trustLevel: row.trustLevel,
      winningOutcomeId: row.winningOutcomeId,
      rawPayload: row.rawPayload as Record<string, unknown>,
      payloadHash: row.payloadHash,
      status: row.status,
      proposedBy: row.proposedBy,
      confirmedBy: row.confirmedBy,
      supersedesId: row.supersedesId,
      createdAt: row.createdAt,
      confirmedAt: row.confirmedAt,
    };
  }
}
