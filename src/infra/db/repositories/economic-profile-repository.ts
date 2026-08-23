import { eq } from "drizzle-orm";
import type {
  CreateEconomicProfileInput,
  EconomicProfileRepository,
  PersistedEconomicProfile,
} from "@/domain/ports";
import { economicProfiles } from "../schema/catalog";
import type { DbTx } from "../uow";

/** `economic_profiles` is append-only — no update/delete methods on this port. */
export class DrizzleEconomicProfileRepository implements EconomicProfileRepository {
  constructor(private readonly tx: DbTx) {}

  async create(input: CreateEconomicProfileInput): Promise<PersistedEconomicProfile> {
    const [row] = await this.tx
      .insert(economicProfiles)
      .values({
        id: input.id,
        oddsNum: input.oddsNum,
        oddsDen: input.oddsDen,
        streamerCommissionBps: input.streamerCommissionBps,
        platformFeeBps: input.platformFeeBps,
        currency: input.currency,
        minStakeMinor: input.minStakeMinor,
        maxStakeMinor: input.maxStakeMinor,
      })
      .returning();

    if (!row) {
      throw new Error("insert into economic_profiles returned no row");
    }
    return this.toProfile(row);
  }

  async findById(id: string): Promise<PersistedEconomicProfile | null> {
    const [row] = await this.tx.select().from(economicProfiles).where(eq(economicProfiles.id, id));
    return row ? this.toProfile(row) : null;
  }

  async list(): Promise<PersistedEconomicProfile[]> {
    const rows = await this.tx.select().from(economicProfiles);
    return rows.map((row) => this.toProfile(row));
  }

  private toProfile(row: typeof economicProfiles.$inferSelect): PersistedEconomicProfile {
    return {
      id: row.id,
      oddsNum: row.oddsNum,
      oddsDen: row.oddsDen,
      streamerCommissionBps: row.streamerCommissionBps,
      platformFeeBps: row.platformFeeBps,
      currency: row.currency,
      minStakeMinor: row.minStakeMinor,
      maxStakeMinor: row.maxStakeMinor,
      createdAt: row.createdAt,
    };
  }
}
