import { DomainError } from "@/domain/errors";
import type {
  AuditWriter,
  Game,
  GameMode,
  GameRepository,
  IdGenerator,
  UnitOfWork,
} from "@/domain/ports";
import { gameCreatedEvent, gameModeCreatedEvent } from "@/application/audit/writer";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export interface CreateGameInput {
  readonly actorId: string;
  readonly slug: string;
  readonly name: string;
}

export interface CreateGameDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly games: (tx: Tx) => GameRepository;
  readonly ids: IdGenerator;
  readonly audit: AuditWriter<Tx>;
}

/** Admin-only game creation (T-401). Games are the top-level, game-agnostic catalog root. */
export class CreateGameUseCase<Tx> {
  constructor(private readonly deps: CreateGameDeps<Tx>) {}

  async execute(input: CreateGameInput): Promise<Game> {
    if (!SLUG_PATTERN.test(input.slug)) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "slug must be lowercase alphanumeric with hyphens",
        {
          details: { field: "slug" },
        },
      );
    }

    if (input.name.trim().length === 0) {
      throw new DomainError("VALIDATION_FAILED", "name must not be empty", {
        details: { field: "name" },
      });
    }

    return this.deps.uow.run(async (tx) => {
      const games = this.deps.games(tx);

      const existing = await games.findBySlug(input.slug);
      if (existing) {
        throw new DomainError("VALIDATION_FAILED", "slug already in use", {
          details: { field: "slug", reason: "SLUG_ALREADY_REGISTERED" },
        });
      }

      const game = await games.create({
        id: this.deps.ids.next(),
        slug: input.slug,
        name: input.name,
      });

      await this.deps.audit.record(tx, gameCreatedEvent(input.actorId, game.id));

      return game;
    });
  }
}

export interface CreateGameModeInput {
  readonly actorId: string;
  readonly gameId: string;
  readonly name: string;
}

export interface CreateGameModeDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly games: (tx: Tx) => GameRepository;
  readonly ids: IdGenerator;
  readonly audit: AuditWriter<Tx>;
}

/** Admin-only game mode creation (T-401). A mode belongs to exactly one game. */
export class CreateGameModeUseCase<Tx> {
  constructor(private readonly deps: CreateGameModeDeps<Tx>) {}

  async execute(input: CreateGameModeInput): Promise<GameMode> {
    if (input.name.trim().length === 0) {
      throw new DomainError("VALIDATION_FAILED", "name must not be empty", {
        details: { field: "name" },
      });
    }

    return this.deps.uow.run(async (tx) => {
      const games = this.deps.games(tx);

      const game = await games.findById(input.gameId);
      if (!game) {
        throw new DomainError("RESOURCE_NOT_FOUND", "game not found", {
          details: { gameId: input.gameId },
        });
      }

      const mode = await games.createMode({
        id: this.deps.ids.next(),
        gameId: input.gameId,
        name: input.name,
      });

      await this.deps.audit.record(tx, gameModeCreatedEvent(input.actorId, mode.id));

      return mode;
    });
  }
}
