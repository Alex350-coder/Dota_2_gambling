import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleGameRepository } from "@/infra/db/repositories/game-repository";
import { DrizzleTeamRepository } from "@/infra/db/repositories/team-repository";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleTeamRepository", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createGame(): Promise<string> {
    const game = await uow.run((tx: DbTx) =>
      new DrizzleGameRepository(tx).create({
        id: randomUUID(),
        slug: `g-${randomUUID()}`,
        name: "G",
      }),
    );
    return game.id;
  }

  it("creates a team and finds it by id", async () => {
    const gameId = await createGame();

    const created = await uow.run((tx: DbTx) =>
      new DrizzleTeamRepository(tx).create({ id: randomUUID(), gameId, name: "Team Liquid" }),
    );

    const found = await uow.run((tx: DbTx) => new DrizzleTeamRepository(tx).findById(created.id));

    expect(found?.id).toBe(created.id);
    expect(found?.gameId).toBe(gameId);
  });

  it("returns null for an unknown team id", async () => {
    const found = await uow.run((tx: DbTx) => new DrizzleTeamRepository(tx).findById(randomUUID()));
    expect(found).toBeNull();
  });

  it("lists teams scoped to a single game", async () => {
    const gameId = await createGame();
    const otherGameId = await createGame();

    const created = await uow.run((tx: DbTx) =>
      new DrizzleTeamRepository(tx).create({ id: randomUUID(), gameId, name: "T1" }),
    );
    await uow.run((tx: DbTx) =>
      new DrizzleTeamRepository(tx).create({ id: randomUUID(), gameId: otherGameId, name: "T2" }),
    );

    const list = await uow.run((tx: DbTx) => new DrizzleTeamRepository(tx).listByGameId(gameId));

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(created.id);
  });
});
