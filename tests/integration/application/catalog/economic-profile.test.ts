import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleEconomicProfileRepository } from "@/infra/db/repositories/economic-profile-repository";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { CreateEconomicProfileUseCase } from "@/application/catalog/economic-profile";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("CreateEconomicProfileUseCase", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const audit = new DrizzleAuditWriter();

  const createEconomicProfile = new CreateEconomicProfileUseCase<DbTx>({
    uow,
    economicProfiles: (tx) => new DrizzleEconomicProfileRepository(tx),
    ids,
    audit,
  });

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createAdmin(): Promise<string> {
    const userId = ids.next();
    await pool.query(
      "INSERT INTO users (id, email, status, date_of_birth) VALUES ($1, $2, 'ACTIVE', '1990-01-01')",
      [userId, `admin-${randomUUID()}@example.test`],
    );
    return userId;
  }

  it("creates the MVP 1.8x/20% profile and emits exactly one ECONOMIC_PROFILE_CREATED audit event", async () => {
    const actorId = await createAdmin();

    const profile = await createEconomicProfile.execute({
      actorId,
      oddsNum: 18,
      oddsDen: 10,
      streamerCommissionBps: 2000,
      platformFeeBps: 0,
      currency: "PEN",
      minStakeMinor: 100n,
      maxStakeMinor: 10_000_000n,
    });

    expect(profile.oddsNum).toBe(18);

    const rows = await pool
      .query(
        "SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'ECONOMIC_PROFILE_CREATED'",
        [profile.id],
      )
      .then((r) => r.rows);
    expect(rows).toHaveLength(1);
  });

  it("rejects a non-self-funding profile before touching the database", async () => {
    const actorId = await createAdmin();

    await expect(
      createEconomicProfile.execute({
        actorId,
        oddsNum: 30,
        oddsDen: 10,
        streamerCommissionBps: 2000,
        platformFeeBps: 0,
        currency: "PEN",
        minStakeMinor: 100n,
        maxStakeMinor: 10_000_000n,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", details: { reason: "NOT_SELF_FUNDING" } });
  });

  it("rejects an invalid stake range", async () => {
    const actorId = await createAdmin();

    await expect(
      createEconomicProfile.execute({
        actorId,
        oddsNum: 18,
        oddsDen: 10,
        streamerCommissionBps: 2000,
        platformFeeBps: 0,
        currency: "PEN",
        minStakeMinor: 10_000_000n,
        maxStakeMinor: 100n,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
