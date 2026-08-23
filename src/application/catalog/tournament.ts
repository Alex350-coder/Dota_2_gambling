import { DomainError } from "@/domain/errors";
import type {
  AuditWriter,
  GameRepository,
  IdGenerator,
  Tournament,
  TournamentRepository,
  UnitOfWork,
} from "@/domain/ports";
import { tournamentCreatedEvent } from "@/application/audit/writer";

export interface CreateTournamentInput {
  readonly actorId: string;
  readonly gameId: string;
  readonly name: string;
  readonly startsAt: Date;
  readonly endsAt?: Date | null;
}

export interface CreateTournamentDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly games: (tx: Tx) => GameRepository;
  readonly tournaments: (tx: Tx) => TournamentRepository;
  readonly ids: IdGenerator;
  readonly audit: AuditWriter<Tx>;
}

/** Admin-only tournament creation (T-402). A tournament belongs to exactly one game. */
export class CreateTournamentUseCase<Tx> {
  constructor(private readonly deps: CreateTournamentDeps<Tx>) {}

  async execute(input: CreateTournamentInput): Promise<Tournament> {
    if (input.name.trim().length === 0) {
      throw new DomainError("VALIDATION_FAILED", "name must not be empty", {
        details: { field: "name" },
      });
    }

    if (input.endsAt && input.endsAt.getTime() < input.startsAt.getTime()) {
      throw new DomainError("VALIDATION_FAILED", "endsAt must not be before startsAt", {
        details: { field: "endsAt" },
      });
    }

    return this.deps.uow.run(async (tx) => {
      const game = await this.deps.games(tx).findById(input.gameId);
      if (!game) {
        throw new DomainError("RESOURCE_NOT_FOUND", "game not found", {
          details: { gameId: input.gameId },
        });
      }

      const tournament = await this.deps.tournaments(tx).create({
        id: this.deps.ids.next(),
        gameId: input.gameId,
        name: input.name,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
      });

      await this.deps.audit.record(tx, tournamentCreatedEvent(input.actorId, tournament.id));

      return tournament;
    });
  }
}
