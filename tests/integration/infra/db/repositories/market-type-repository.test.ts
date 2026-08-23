import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleMarketTypeRepository } from "@/infra/db/repositories/market-type-repository";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleMarketTypeRepository", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates and finds a market type by code", async () => {
    const code = `MATCH_WINNER_${randomUUID()}`;

    const created = await uow.run(async (tx: DbTx) =>
      new DrizzleMarketTypeRepository(tx).create(randomUUID(), {
        code,
        name: "Match Winner",
        outcomeCardinality: "BINARY",
      }),
    );

    expect(created.code).toBe(code);
    expect(created.outcomeCardinality).toBe("BINARY");

    const found = await uow.run(async (tx: DbTx) =>
      new DrizzleMarketTypeRepository(tx).findByCode(code),
    );
    expect(found?.id).toBe(created.id);
  });

  it("returns null for an unknown code", async () => {
    const found = await uow.run(async (tx: DbTx) =>
      new DrizzleMarketTypeRepository(tx).findByCode(`missing-${randomUUID()}`),
    );
    expect(found).toBeNull();
  });

  it("lists all market types including a newly created N_ARY type", async () => {
    const code = `TOP_FRAGGER_${randomUUID()}`;
    await uow.run(async (tx: DbTx) =>
      new DrizzleMarketTypeRepository(tx).create(randomUUID(), {
        code,
        name: "Top Fragger",
        outcomeCardinality: "N_ARY",
      }),
    );

    const all = await uow.run(async (tx: DbTx) => new DrizzleMarketTypeRepository(tx).list());
    expect(all.some((mt) => mt.code === code && mt.outcomeCardinality === "N_ARY")).toBe(true);
  });
});
