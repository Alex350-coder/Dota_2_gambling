import { eq } from "drizzle-orm";
import type { CreateMarketInput, Market, MarketRepository } from "@/domain/ports";
import { markets } from "../schema/catalog";
import type { DbTx } from "../uow";

/** `markets` has no owner — a plain finder, unlike the owner-scoped repositories. */
export class DrizzleMarketRepository implements MarketRepository {
  constructor(private readonly tx: DbTx) {}

  async create(input: CreateMarketInput): Promise<Market> {
    const [row] = await this.tx
      .insert(markets)
      .values({
        id: input.id,
        matchId: input.matchId,
        marketTypeId: input.marketTypeId,
        streamerId: input.streamerId,
        economicProfileId: input.economicProfileId,
        closesAt: input.closesAt,
      })
      .returning();

    if (!row) {
      throw new Error("insert into markets returned no row");
    }
    return this.toMarket(row);
  }

  async findById(id: string): Promise<Market | null> {
    const [row] = await this.tx.select().from(markets).where(eq(markets.id, id));
    return row ? this.toMarket(row) : null;
  }

  async findByMatchId(matchId: string): Promise<Market[]> {
    const rows = await this.tx.select().from(markets).where(eq(markets.matchId, matchId));
    return rows.map((row) => this.toMarket(row));
  }

  private toMarket(row: typeof markets.$inferSelect): Market {
    return {
      id: row.id,
      matchId: row.matchId,
      marketTypeId: row.marketTypeId,
      streamerId: row.streamerId,
      economicProfileId: row.economicProfileId,
      status: row.status,
      closesAt: row.closesAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
