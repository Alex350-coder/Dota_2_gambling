import { DomainError } from "@/domain/errors";
import type { Game, GameRepository, UnitOfWork } from "@/domain/ports";
import { type Page, type PageInput, paginate } from "./pagination";

export interface ListGamesDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly games: (tx: Tx) => GameRepository;
}

/** Public, unauthenticated game listing (T-410). */
export class ListGamesUseCase<Tx> {
  constructor(private readonly deps: ListGamesDeps<Tx>) {}

  async execute(input: PageInput): Promise<Page<Game>> {
    const all = await this.deps.uow.run((tx) => this.deps.games(tx).list());
    return paginate(all, input);
  }
}

export interface GetGameInput {
  readonly id: string;
}

export interface GetGameDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly games: (tx: Tx) => GameRepository;
}

/** Public, unauthenticated game detail lookup (T-410). */
export class GetGameUseCase<Tx> {
  constructor(private readonly deps: GetGameDeps<Tx>) {}

  async execute(input: GetGameInput): Promise<Game> {
    const game = await this.deps.uow.run((tx) => this.deps.games(tx).findById(input.id));
    if (!game) {
      throw new DomainError("RESOURCE_NOT_FOUND", "game not found", {
        details: { gameId: input.id },
      });
    }
    return game;
  }
}
