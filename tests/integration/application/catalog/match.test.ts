import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "@/infra/db/client";
import { DrizzleUnitOfWork, type DbTx } from "@/infra/db/uow";
import { DrizzleGameRepository } from "@/infra/db/repositories/game-repository";
import { DrizzleTournamentRepository } from "@/infra/db/repositories/tournament-repository";
import { DrizzleTeamRepository } from "@/infra/db/repositories/team-repository";
import { DrizzleMatchRepository } from "@/infra/db/repositories/match-repository";
import { DrizzleAuditWriter } from "@/infra/db/audit-writer";
import { CryptoIdGenerator } from "@/infra/id-generator";
import { CreateGameUseCase } from "@/application/catalog/game";
import { CreateTournamentUseCase } from "@/application/catalog/tournament";
import {
  AddMatchParticipantUseCase,
  CreateMatchUseCase,
  CreateTeamUseCase,
} from "@/application/catalog/match";
import { testDbConfig } from "../../../helpers/test-db-config";
import { resetAndMigrate } from "../../../helpers/reset-db";

describe("CreateTeamUseCase + CreateMatchUseCase + AddMatchParticipantUseCase", () => {
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
  const createTeam = new CreateTeamUseCase<DbTx>({
    uow,
    games: (tx) => new DrizzleGameRepository(tx),
    teams: (tx) => new DrizzleTeamRepository(tx),
    ids,
    audit,
  });
  const createMatch = new CreateMatchUseCase<DbTx>({
    uow,
    tournaments: (tx) => new DrizzleTournamentRepository(tx),
    matches: (tx) => new DrizzleMatchRepository(tx),
    ids,
    audit,
  });
  const addParticipant = new AddMatchParticipantUseCase<DbTx>({
    uow,
    matches: (tx) => new DrizzleMatchRepository(tx),
    teams: (tx) => new DrizzleTeamRepository(tx),
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

  async function createFixtures(actorId: string): Promise<{
    tournamentId: string;
    gameModeId: string;
    teamA: string;
    teamB: string;
  }> {
    const game = await createGame.execute({ actorId, slug: `g-${randomUUID()}`, name: "G" });
    const [modeRow] = await pool
      .query("INSERT INTO game_modes (game_id, name) VALUES ($1, 'Std') RETURNING id", [game.id])
      .then((r) => r.rows);
    const tournament = await createTournament.execute({
      actorId,
      gameId: game.id,
      name: "T",
      startsAt: new Date(),
    });
    const teamA = await createTeam.execute({ actorId, gameId: game.id, name: "Team A" });
    const teamB = await createTeam.execute({ actorId, gameId: game.id, name: "Team B" });

    return {
      tournamentId: tournament.id,
      gameModeId: modeRow.id as string,
      teamA: teamA.id,
      teamB: teamB.id,
    };
  }

  it("creates a match and emits exactly one MATCH_CREATED audit event", async () => {
    const actorId = await createAdmin();
    const { tournamentId, gameModeId } = await createFixtures(actorId);

    const match = await createMatch.execute({
      actorId,
      tournamentId,
      gameModeId,
      scheduledAt: new Date(),
    });

    const rows = await pool
      .query("SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'MATCH_CREATED'", [
        match.id,
      ])
      .then((r) => r.rows);
    expect(rows).toHaveLength(1);
  });

  it("assigns two distinct teams to distinct sides", async () => {
    const actorId = await createAdmin();
    const { tournamentId, gameModeId, teamA, teamB } = await createFixtures(actorId);
    const match = await createMatch.execute({
      actorId,
      tournamentId,
      gameModeId,
      scheduledAt: new Date(),
    });

    await addParticipant.execute({ actorId, matchId: match.id, teamId: teamA, side: "A" });
    await addParticipant.execute({ actorId, matchId: match.id, teamId: teamB, side: "B" });

    const rows = await pool
      .query("SELECT team_id, side FROM match_participants WHERE match_id = $1 ORDER BY side", [
        match.id,
      ])
      .then((r) => r.rows);
    expect(rows).toEqual([
      { team_id: teamA, side: "A" },
      { team_id: teamB, side: "B" },
    ]);
  });

  it("rejects assigning a second team to an already-occupied side", async () => {
    const actorId = await createAdmin();
    const { tournamentId, gameModeId, teamA, teamB } = await createFixtures(actorId);
    const match = await createMatch.execute({
      actorId,
      tournamentId,
      gameModeId,
      scheduledAt: new Date(),
    });

    await addParticipant.execute({ actorId, matchId: match.id, teamId: teamA, side: "A" });

    await expect(
      addParticipant.execute({ actorId, matchId: match.id, teamId: teamB, side: "A" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { reason: "SLOT_ALREADY_ASSIGNED" },
    });
  });

  it("rejects assigning the same team to a second side", async () => {
    const actorId = await createAdmin();
    const { tournamentId, gameModeId, teamA } = await createFixtures(actorId);
    const match = await createMatch.execute({
      actorId,
      tournamentId,
      gameModeId,
      scheduledAt: new Date(),
    });

    await addParticipant.execute({ actorId, matchId: match.id, teamId: teamA, side: "A" });

    await expect(
      addParticipant.execute({ actorId, matchId: match.id, teamId: teamA, side: "B" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { reason: "TEAM_ALREADY_PARTICIPANT" },
    });
  });

  it("rejects an invalid side value", async () => {
    const actorId = await createAdmin();
    const { tournamentId, gameModeId, teamA } = await createFixtures(actorId);
    const match = await createMatch.execute({
      actorId,
      tournamentId,
      gameModeId,
      scheduledAt: new Date(),
    });

    await expect(
      addParticipant.execute({ actorId, matchId: match.id, teamId: teamA, side: "C" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
