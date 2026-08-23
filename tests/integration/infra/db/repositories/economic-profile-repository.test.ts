import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleEconomicProfileRepository } from "@/infra/db/repositories/economic-profile-repository";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleEconomicProfileRepository", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates and finds the MVP self-funding profile (1.8x / 20% commission)", async () => {
    const created = await uow.run(async (tx: DbTx) =>
      new DrizzleEconomicProfileRepository(tx).create({
        id: randomUUID(),
        oddsNum: 18,
        oddsDen: 10,
        streamerCommissionBps: 2000,
        platformFeeBps: 0,
        currency: "PEN",
        minStakeMinor: 100n,
        maxStakeMinor: 10_000_000n,
      }),
    );

    expect(created.oddsNum).toBe(18);
    expect(created.oddsDen).toBe(10);

    const found = await uow.run(async (tx: DbTx) =>
      new DrizzleEconomicProfileRepository(tx).findById(created.id),
    );
    expect(found?.id).toBe(created.id);
  });

  it("rejects a non-self-funding profile at the database constraint level", async () => {
    await expect(
      uow.run(async (tx: DbTx) =>
        new DrizzleEconomicProfileRepository(tx).create({
          id: randomUUID(),
          oddsNum: 30,
          oddsDen: 10,
          streamerCommissionBps: 2000,
          platformFeeBps: 0,
          currency: "PEN",
          minStakeMinor: 100n,
          maxStakeMinor: 10_000_000n,
        }),
      ),
    ).rejects.toThrow();
  });

  it("lists all created profiles", async () => {
    const created = await uow.run(async (tx: DbTx) =>
      new DrizzleEconomicProfileRepository(tx).create({
        id: randomUUID(),
        oddsNum: 18,
        oddsDen: 10,
        streamerCommissionBps: 2000,
        platformFeeBps: 0,
        currency: "PEN",
        minStakeMinor: 100n,
        maxStakeMinor: 10_000_000n,
      }),
    );

    const all = await uow.run(async (tx: DbTx) => new DrizzleEconomicProfileRepository(tx).list());
    expect(all.some((p) => p.id === created.id)).toBe(true);
  });
});
