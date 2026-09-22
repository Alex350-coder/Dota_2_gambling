import { and, count, eq } from "drizzle-orm";
import type {
  CreateRiskAlertInput,
  RiskAlertFilter,
  RiskAlertRecord,
  RiskAlertRepository,
} from "@/domain/ports";
import { riskAlerts } from "../schema/risk";
import type { DbTx } from "../uow";

/** `risk_alerts` is ownerless (admin/system-scoped) — a plain finder, no ownership filter. */
export class DrizzleRiskAlertRepository implements RiskAlertRepository {
  constructor(private readonly tx: DbTx) {}

  async create(input: CreateRiskAlertInput): Promise<RiskAlertRecord> {
    const [row] = await this.tx
      .insert(riskAlerts)
      .values({
        id: input.id,
        ruleId: input.ruleId,
        severity: input.severity,
        entityType: input.entityType,
        entityId: input.entityId,
        payload: input.payload,
        createdAt: input.createdAt,
      })
      .returning();

    if (!row) {
      throw new Error("insert into risk_alerts returned no row");
    }
    return toRecord(row);
  }

  async findById(id: string): Promise<RiskAlertRecord | null> {
    const [row] = await this.tx.select().from(riskAlerts).where(eq(riskAlerts.id, id));
    return row ? toRecord(row) : null;
  }

  async list(filter?: RiskAlertFilter): Promise<RiskAlertRecord[]> {
    const conditions = [];
    if (filter?.ruleId) conditions.push(eq(riskAlerts.ruleId, filter.ruleId));
    if (filter?.status) conditions.push(eq(riskAlerts.status, filter.status));
    if (filter?.entityType) conditions.push(eq(riskAlerts.entityType, filter.entityType));
    if (filter?.entityId) conditions.push(eq(riskAlerts.entityId, filter.entityId));

    const rows =
      conditions.length > 0
        ? await this.tx
            .select()
            .from(riskAlerts)
            .where(and(...conditions))
        : await this.tx.select().from(riskAlerts);
    return rows.map(toRecord);
  }

  async countOpen(): Promise<number> {
    const [row] = await this.tx
      .select({ value: count() })
      .from(riskAlerts)
      .where(eq(riskAlerts.status, "OPEN"));
    return row ? row.value : 0;
  }
}

function toRecord(row: typeof riskAlerts.$inferSelect): RiskAlertRecord {
  return {
    id: row.id,
    ruleId: row.ruleId,
    severity: row.severity,
    entityType: row.entityType,
    entityId: row.entityId,
    payload: row.payload as Record<string, unknown>,
    status: row.status,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
  };
}
