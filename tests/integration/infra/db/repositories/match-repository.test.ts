import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleGameRepository } from "@/infra/db/repositories/game-repository";
import { DrizzleTournamentRepository } from "@/infra/db/repositories/tournament-repository";
import { DrizzleTeamRepository } from "@/infra/db/repositories/team-repository";
import { DrizzleMatchRepository } from "@/infra/db/repositories/match-repository";
import { testDbConfig } from "../../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../../helpers/reset-db";

describe("DrizzleMatchRepository", () => {
  const pool = createPool(testDbConfig());
  const db = createDb(pool);
  const uow = new DrizzleUnitOfWork(db);

  beforeAll(async () => {
    await resetAndMigrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createFixtures(): Promise<{
    tournamentId: string;
    gameModeId: string;
    teamId: string;
  }> {
    const game = await uow.run((tx: DbTx) =>
      new DrizzleGameRepository(tx).create({
        id: randomUUID(),
        slug: `g-${randomUUID()}`,
        name: "G",
      }),
    );
    const mode = await uow.run((tx: DbTx) =>
      new DrizzleGameRepository(tx).createMode({ id: randomUUID(), gameId: game.id, name: "Std" }),
    );
    const tournament = await uow.run((tx: DbTx) =>
      new DrizzleTournamentRepository(tx).create({
        id: randomUUID(),
        gameId: game.id,
        name: "T",
        startsAt: new Date(),
      }),
    );
    const team = await uow.run((tx: DbTx) =>
      new DrizzleTeamRepository(tx).create({ id: randomUUID(), gameId: game.id, name: "Team" }),
    );

    return { tournamentId: tournament.id, gameModeId: mode.id, teamId: team.id };
  }

  it("creates a match and finds it by id", async () => {
    const { tournamentId, gameModeId } = await createFixtures();

    const created = await uow.run((tx: DbTx) =>
      new DrizzleMatchRepository(tx).create({
        id: randomUUID(),
        tournamentId,
        gameModeId,
        scheduledAt: new Date(),
      }),
    );

    const found = await uow.run((tx: DbTx) => new DrizzleMatchRepository(tx).findById(created.id));

    expect(found?.id).toBe(created.id);
    expect(found?.playedAt).toBeNull();
  });

  it("lists matches scoped to a single tournament", async () => {
    const { tournamentId, gameModeId } = await createFixtures();
    const { tournamentId: otherTournamentId } = await createFixtures();

    const created = await uow.run((tx: DbTx) =>
      new DrizzleMatchRepository(tx).create({
        id: randomUUID(),
        tournamentId,
        gameModeId,
        scheduledAt: new Date(),
      }),
    );
    await uow.run((tx: DbTx) =>
      new DrizzleMatchRepository(tx).create({
        id: randomUUID(),
        tournamentId: otherTournamentId,
        gameModeId,
        scheduledAt: new Date(),
      }),
    );

    const list = await uow.run((tx: DbTx) =>
      new DrizzleMatchRepository(tx).listByTournamentId(tournamentId),
    );

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(created.id);
  });

  it("adds a participant and lists it back", async () => {
    const { tournamentId, gameModeId, teamId } = await createFixtures();
    const match = await uow.run((tx: DbTx) =>
      new DrizzleMatchRepository(tx).create({
        id: randomUUID(),
        tournamentId,
        gameModeId,
        scheduledAt: new Date(),
      }),
    );

    await uow.run((tx: DbTx) =>
      new DrizzleMatchRepository(tx).addParticipant({ matchId: match.id, teamId, side: "A" }),
    );

    const participants = await uow.run((tx: DbTx) =>
      new DrizzleMatchRepository(tx).listParticipants(match.id),
    );

    expect(participants).toHaveLength(1);
    expect(participants[0]).toMatchObject({ matchId: match.id, teamId, side: "A" });
  });

  it("rejects a side outside 'A'/'B' at the database constraint level", async () => {
    const { tournamentId, gameModeId, teamId } = await createFixtures();
    const match = await uow.run((tx: DbTx) =>
      new DrizzleMatchRepository(tx).create({
        id: randomUUID(),
        tournamentId,
        gameModeId,
        scheduledAt: new Date(),
      }),
    );

    await expect(
      uow.run((tx: DbTx) =>
        new DrizzleMatchRepository(tx).addParticipant({ matchId: match.id, teamId, side: "C" }),
      ),
    ).rejects.toThrow();
  });
});
