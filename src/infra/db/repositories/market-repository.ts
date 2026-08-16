import { eq } from "drizzle-orm";
import type { Market, MarketRepository } from "@/domain/ports";
import { markets } from "../schema/catalog";
import type { DbTx } from "../uow";

/** `markets` has no owner — a plain finder, unlike the owner-scoped repositories. */
export class DrizzleMarketRepository implements MarketRepository {
  constructor(private readonly tx: DbTx) {}

  async findById(id: string): Promise<Market | null> {
    const [row] = await this.tx.select().from(markets).where(eq(markets.id, id));

    if (!row) {
      return null;
    }

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
