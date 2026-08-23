import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleGameRepository } from "@/infra/db/repositories/game-repository";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { CreateGameModeUseCase, CreateGameUseCase } from "@/application/catalog/game";
import { DomainError } from "@/domain/errors";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("CreateGameUseCase + CreateGameModeUseCase", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);
  const ids = new CryptoIdGenerator();
  const audit = new DrizzleAuditWriter();

  const createGame = new CreateGameUseCase<DbTx>({
    uow,
    games: (tx) => new DrizzleGameRepository(tx),
    ids,
    audit,
  });

  const createGameMode = new CreateGameModeUseCase<DbTx>({
    uow,
    games: (tx) => new DrizzleGameRepository(tx),
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

  it("creates a game and emits exactly one GAME_CREATED audit event", async () => {
    const actorId = await createAdmin();
    const slug = `dota2-${randomUUID()}`;

    const game = await createGame.execute({ actorId, slug, name: "Dota 2" });

    expect(game.slug).toBe(slug);

    const rows = await pool
      .query("SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'GAME_CREATED'", [
        game.id,
      ])
      .then((r) => r.rows);
    expect(rows).toHaveLength(1);
  });

  it("rejects a duplicate slug with VALIDATION_FAILED", async () => {
    const actorId = await createAdmin();
    const slug = `dup-${randomUUID()}`;
    await createGame.execute({ actorId, slug, name: "First" });

    await expect(createGame.execute({ actorId, slug, name: "Second" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("rejects an invalid slug format", async () => {
    const actorId = await createAdmin();

    await expect(
      createGame.execute({ actorId, slug: "Not A Slug!", name: "Bad" }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("creates a game mode for an existing game", async () => {
    const actorId = await createAdmin();
    const game = await createGame.execute({ actorId, slug: `g-${randomUUID()}`, name: "G" });

    const mode = await createGameMode.execute({ actorId, gameId: game.id, name: "Standard" });

    expect(mode.gameId).toBe(game.id);
  });

  it("reports RESOURCE_NOT_FOUND when creating a mode for an unknown game", async () => {
    const actorId = await createAdmin();

    await expect(
      createGameMode.execute({ actorId, gameId: randomUUID(), name: "Standard" }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});
