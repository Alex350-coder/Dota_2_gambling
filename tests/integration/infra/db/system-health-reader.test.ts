import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleSystemHealthReader } from "@/infra/db/system-health-reader";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("DrizzleSystemHealthReader", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("reports the latest applied migration id and zero job counts on a fresh database", async () => {
    const status = await uow.run((tx: DbTx) => new DrizzleSystemHealthReader(tx).getStatus());

    expect(status.migrationVersion).toMatch(/^\d{4}_.*\.sql$/);
    expect(status.pendingJobCount).toBe(0);
    expect(status.failedJobCount).toBe(0);
  });

  it("counts pending and failed jobs", async () => {
    await pool.query(
      `INSERT INTO jobs (id, kind, payload, status) VALUES ($1, 'test', '{}', 'PENDING')`,
      [randomUUID()],
    );
    await pool.query(
      `INSERT INTO jobs (id, kind, payload, status) VALUES ($1, 'test', '{}', 'FAILED')`,
      [randomUUID()],
    );

    const status = await uow.run((tx: DbTx) => new DrizzleSystemHealthReader(tx).getStatus());
    expect(status.pendingJobCount).toBe(1);
    expect(status.failedJobCount).toBe(1);
  });
});
