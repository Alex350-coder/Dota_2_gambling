import { DomainError } from "@/domain/errors";
import type {
  AuditWriter,
  GameRepository,
  IdGenerator,
  Match,
  MatchParticipant,
  MatchRepository,
  Team,
  TeamRepository,
  TournamentRepository,
  UnitOfWork,
} from "@/domain/ports";
import {
  matchCreatedEvent,
  matchParticipantAddedEvent,
  teamCreatedEvent,
} from "@/application/audit/writer";

const VALID_SIDES = ["A", "B"] as const;

export interface CreateTeamInput {
  readonly actorId: string;
  readonly gameId: string;
  readonly name: string;
}

export interface CreateTeamDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly games: (tx: Tx) => GameRepository;
  readonly teams: (tx: Tx) => TeamRepository;
  readonly ids: IdGenerator;
  readonly audit: AuditWriter<Tx>;
}

/** Admin-only team creation (T-403). A team belongs to exactly one game. */
export class CreateTeamUseCase<Tx> {
  constructor(private readonly deps: CreateTeamDeps<Tx>) {}

  async execute(input: CreateTeamInput): Promise<Team> {
    if (input.name.trim().length === 0) {
      throw new DomainError("VALIDATION_FAILED", "name must not be empty", {
        details: { field: "name" },
      });
    }

    return this.deps.uow.run(async (tx) => {
      const game = await this.deps.games(tx).findById(input.gameId);
      if (!game) {
        throw new DomainError("RESOURCE_NOT_FOUND", "game not found", {
          details: { gameId: input.gameId },
        });
      }

      const team = await this.deps.teams(tx).create({
        id: this.deps.ids.next(),
        gameId: input.gameId,
        name: input.name,
      });

      await this.deps.audit.record(tx, teamCreatedEvent(input.actorId, team.id));

      return team;
    });
  }
}

export interface CreateMatchInput {
  readonly actorId: string;
  readonly tournamentId: string;
  readonly gameModeId: string;
  readonly scheduledAt: Date;
}

export interface CreateMatchDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly tournaments: (tx: Tx) => TournamentRepository;
  readonly matches: (tx: Tx) => MatchRepository;
  readonly ids: IdGenerator;
  readonly audit: AuditWriter<Tx>;
}

/** Admin-only match creation (T-403). A match belongs to exactly one tournament and game mode. */
export class CreateMatchUseCase<Tx> {
  constructor(private readonly deps: CreateMatchDeps<Tx>) {}

  async execute(input: CreateMatchInput): Promise<Match> {
    return this.deps.uow.run(async (tx) => {
      const tournament = await this.deps.tournaments(tx).findById(input.tournamentId);
      if (!tournament) {
        throw new DomainError("RESOURCE_NOT_FOUND", "tournament not found", {
          details: { tournamentId: input.tournamentId },
        });
      }

      const match = await this.deps.matches(tx).create({
        id: this.deps.ids.next(),
        tournamentId: input.tournamentId,
        gameModeId: input.gameModeId,
        scheduledAt: input.scheduledAt,
      });

      await this.deps.audit.record(tx, matchCreatedEvent(input.actorId, match.id));

      return match;
    });
  }
}

export interface AddMatchParticipantInput {
  readonly actorId: string;
  readonly matchId: string;
  readonly teamId: string;
  readonly side: string;
}

export interface AddMatchParticipantDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly matches: (tx: Tx) => MatchRepository;
  readonly teams: (tx: Tx) => TeamRepository;
  readonly audit: AuditWriter<Tx>;
}

/**
 * Admin-only match participant assignment (T-403). Every match has exactly
 * two sides ("A"/"B" per `chk_match_participants_side`); this use case
 * enforces slot uniqueness (one team per side) and team-distinctness at the
 * application layer, since the DB has no unique constraint on (match_id,
 * side) — only the composite (match_id, team_id) primary key.
 */
export class AddMatchParticipantUseCase<Tx> {
  constructor(private readonly deps: AddMatchParticipantDeps<Tx>) {}

  async execute(input: AddMatchParticipantInput): Promise<MatchParticipant> {
    if (!VALID_SIDES.includes(input.side as (typeof VALID_SIDES)[number])) {
      throw new DomainError("VALIDATION_FAILED", "side must be 'A' or 'B'", {
        details: { field: "side" },
      });
    }

    return this.deps.uow.run(async (tx) => {
      const matches = this.deps.matches(tx);

      const match = await matches.findById(input.matchId);
      if (!match) {
        throw new DomainError("RESOURCE_NOT_FOUND", "match not found", {
          details: { matchId: input.matchId },
        });
      }

      const team = await this.deps.teams(tx).findById(input.teamId);
      if (!team) {
        throw new DomainError("RESOURCE_NOT_FOUND", "team not found", {
          details: { teamId: input.teamId },
        });
      }

      const existing = await matches.listParticipants(input.matchId);

      if (existing.some((p) => p.side === input.side)) {
        throw new DomainError("VALIDATION_FAILED", "side is already assigned for this match", {
          details: { field: "side", reason: "SLOT_ALREADY_ASSIGNED" },
        });
      }

      if (existing.some((p) => p.teamId === input.teamId)) {
        throw new DomainError("VALIDATION_FAILED", "team is already a participant in this match", {
          details: { field: "teamId", reason: "TEAM_ALREADY_PARTICIPANT" },
        });
      }

      const participant = await matches.addParticipant({
        matchId: input.matchId,
        teamId: input.teamId,
        side: input.side,
      });

      await this.deps.audit.record(tx, matchParticipantAddedEvent(input.actorId, input.matchId));

      return participant;
    });
  }
}
