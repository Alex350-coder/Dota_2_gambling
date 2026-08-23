import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleMarketTypeRepository } from "@/infra/db/repositories/market-type-repository";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { CreateMarketTypeUseCase } from "@/application/catalog/market-type";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("CreateMarketTypeUseCase", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const audit = new DrizzleAuditWriter();

  const createMarketType = new CreateMarketTypeUseCase<DbTx>({
    uow,
    marketTypes: (tx) => new DrizzleMarketTypeRepository(tx),
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

  it("creates a binary market type and emits exactly one MARKET_TYPE_CREATED audit event", async () => {
    const actorId = await createAdmin();
    const code = `MATCH_WINNER_${randomUUID()}`;

    const marketType = await createMarketType.execute({
      actorId,
      code,
      name: "Match Winner",
      outcomeCardinality: "BINARY",
    });

    expect(marketType.code).toBe(code);

    const rows = await pool
      .query(
        "SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'MARKET_TYPE_CREATED'",
        [marketType.id],
      )
      .then((r) => r.rows);
    expect(rows).toHaveLength(1);
  });

  it("rejects an N_ARY market type with UNSUPPORTED_MARKET_MODEL", async () => {
    const actorId = await createAdmin();

    await expect(
      createMarketType.execute({
        actorId,
        code: `TOP_FRAGGER_${randomUUID()}`,
        name: "Top Fragger",
        outcomeCardinality: "N_ARY",
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_MARKET_MODEL" });
  });

  it("rejects a duplicate code with VALIDATION_FAILED", async () => {
    const actorId = await createAdmin();
    const code = `DUP_${randomUUID()}`;
    await createMarketType.execute({ actorId, code, name: "First", outcomeCardinality: "BINARY" });

    await expect(
      createMarketType.execute({ actorId, code, name: "Second", outcomeCardinality: "BINARY" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
