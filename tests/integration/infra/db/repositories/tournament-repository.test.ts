import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleGameRepository } from "@/infra/db/repositories/game-repository";
import { DrizzleTournamentRepository } from "@/infra/db/repositories/tournament-repository";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleTournamentRepository", () => {
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

  it("creates a tournament and finds it by id", async () => {
    const gameId = await createGame();
    const startsAt = new Date("2026-01-01T00:00:00Z");

    const created = await uow.run((tx: DbTx) =>
      new DrizzleTournamentRepository(tx).create({
        id: randomUUID(),
        gameId,
        name: "The International",
        startsAt,
      }),
    );

    const found = await uow.run((tx: DbTx) =>
      new DrizzleTournamentRepository(tx).findById(created.id),
    );

    expect(found?.id).toBe(created.id);
    expect(found?.gameId).toBe(gameId);
    expect(found?.endsAt).toBeNull();
  });

  it("returns null for an unknown tournament id", async () => {
    const found = await uow.run((tx: DbTx) =>
      new DrizzleTournamentRepository(tx).findById(randomUUID()),
    );

    expect(found).toBeNull();
  });

  it("lists tournaments scoped to a single game", async () => {
    const gameId = await createGame();
    const otherGameId = await createGame();
    const startsAt = new Date("2026-01-01T00:00:00Z");

    const created = await uow.run((tx: DbTx) =>
      new DrizzleTournamentRepository(tx).create({
        id: randomUUID(),
        gameId,
        name: "T1",
        startsAt,
      }),
    );
    await uow.run((tx: DbTx) =>
      new DrizzleTournamentRepository(tx).create({
        id: randomUUID(),
        gameId: otherGameId,
        name: "T2",
        startsAt,
      }),
    );

    const list = await uow.run((tx: DbTx) =>
      new DrizzleTournamentRepository(tx).listByGameId(gameId),
    );

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(created.id);
  });
});
