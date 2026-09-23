import { count, eq, sql } from "drizzle-orm";
import type { SystemHealthReader, SystemHealthStatus } from "@/domain/ports";
import { jobs } from "./schema/platform";
import type { DbTx } from "./uow";

interface MigrationRow {
  readonly rows: readonly { readonly id: string }[];
}

export class DrizzleSystemHealthReader implements SystemHealthReader {
  constructor(private readonly tx: DbTx) {}

  async getStatus(): Promise<SystemHealthStatus> {
    // Sequenced, not Promise.all: `tx` is a single connection inside one transaction, and
    // pg's client.query() rejects overlapping concurrent queries on the same connection.
    const migrationResult = (await this.tx.execute(
      sql`SELECT id FROM schema_migrations ORDER BY applied_at DESC LIMIT 1`,
    )) as MigrationRow;
    const pendingRow = await this.tx
      .select({ value: count() })
      .from(jobs)
      .where(eq(jobs.status, "PENDING"));
    const failedRow = await this.tx
      .select({ value: count() })
      .from(jobs)
      .where(eq(jobs.status, "FAILED"));

    return {
      migrationVersion: migrationResult.rows[0]?.id ?? null,
      pendingJobCount: pendingRow[0]?.value ?? 0,
      failedJobCount: failedRow[0]?.value ?? 0,
    };
  }
}
