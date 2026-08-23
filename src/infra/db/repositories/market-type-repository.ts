import { eq } from "drizzle-orm";
import type { MarketType } from "@/domain/catalog";
import type { MarketTypeRepository, PersistedMarketType } from "@/domain/ports";
import { marketTypes } from "../schema/catalog";
import type { DbTx } from "../uow";

/** `market_types` is an ownerless catalog entity — a plain finder, no ownership scoping. */
export class DrizzleMarketTypeRepository implements MarketTypeRepository {
  constructor(private readonly tx: DbTx) {}

  async create(id: string, input: MarketType): Promise<PersistedMarketType> {
    const [row] = await this.tx
      .insert(marketTypes)
      .values({
        id,
        code: input.code,
        name: input.name,
        outcomeCardinality: input.outcomeCardinality,
      })
      .returning();

    if (!row) {
      throw new Error("insert into market_types returned no row");
    }
    return this.toMarketType(row);
  }

  async findByCode(code: string): Promise<PersistedMarketType | null> {
    const [row] = await this.tx.select().from(marketTypes).where(eq(marketTypes.code, code));
    return row ? this.toMarketType(row) : null;
  }

  async list(): Promise<PersistedMarketType[]> {
    const rows = await this.tx.select().from(marketTypes);
    return rows.map((row) => this.toMarketType(row));
  }

  private toMarketType(row: typeof marketTypes.$inferSelect): PersistedMarketType {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      outcomeCardinality: row.outcomeCardinality,
    };
  }
}
