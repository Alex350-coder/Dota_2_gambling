import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleGameRepository } from "@/infra/db/repositories/game-repository";
import { DrizzleTournamentRepository } from "@/infra/db/repositories/tournament-repository";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { CreateGameUseCase } from "@/application/catalog/game";
import { CreateTournamentUseCase } from "@/application/catalog/tournament";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("CreateTournamentUseCase", () => {
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

  const createTournament = new CreateTournamentUseCase<DbTx>({
    uow,
    games: (tx) => new DrizzleGameRepository(tx),
    tournaments: (tx) => new DrizzleTournamentRepository(tx),
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

  it("creates a tournament and emits exactly one TOURNAMENT_CREATED audit event", async () => {
    const actorId = await createAdmin();
    const game = await createGame.execute({ actorId, slug: `g-${randomUUID()}`, name: "G" });

    const tournament = await createTournament.execute({
      actorId,
      gameId: game.id,
      name: "The International",
      startsAt: new Date("2026-01-01T00:00:00Z"),
    });

    expect(tournament.gameId).toBe(game.id);

    const rows = await pool
      .query(
        "SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'TOURNAMENT_CREATED'",
        [tournament.id],
      )
      .then((r) => r.rows);
    expect(rows).toHaveLength(1);
  });

  it("reports RESOURCE_NOT_FOUND for an unknown game id", async () => {
    const actorId = await createAdmin();

    await expect(
      createTournament.execute({
        actorId,
        gameId: randomUUID(),
        name: "T",
        startsAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("rejects endsAt before startsAt", async () => {
    const actorId = await createAdmin();
    const game = await createGame.execute({ actorId, slug: `g-${randomUUID()}`, name: "G" });

    await expect(
      createTournament.execute({
        actorId,
        gameId: game.id,
        name: "T",
        startsAt: new Date("2026-01-02T00:00:00Z"),
        endsAt: new Date("2026-01-01T00:00:00Z"),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
