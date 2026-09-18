import { eq } from "drizzle-orm";
import type {
  CreateSelfExclusionInput,
  SelfExclusionRecord,
  SelfExclusionRepository,
} from "@/domain/ports";
import { selfExclusions } from "../schema/compliance";
import type { DbTx } from "../uow";

export class DrizzleSelfExclusionRepository implements SelfExclusionRepository {
  constructor(
    private readonly tx: DbTx,
    private readonly ownerId: string,
  ) {}

  async create(input: CreateSelfExclusionInput): Promise<SelfExclusionRecord> {
    const [row] = await this.tx
      .insert(selfExclusions)
      .values({
        id: input.id,
        userId: input.userId,
        period: input.period,
        startedAt: input.startedAt,
        revocableAt: input.revocableAt,
      })
      .returning();
    if (!row) {
      throw new Error("insert into self_exclusions returned no row");
    }
    return toRecord(row);
  }

  async listByUserId(): Promise<SelfExclusionRecord[]> {
    const rows = await this.tx
      .select()
      .from(selfExclusions)
      .where(eq(selfExclusions.userId, this.ownerId));
    return rows.map(toRecord);
  }
}

function toRecord(row: typeof selfExclusions.$inferSelect): SelfExclusionRecord {
  return {
    id: row.id,
    userId: row.userId,
    period: row.period,
    startedAt: row.startedAt,
    revocableAt: row.revocableAt,
  };
}
