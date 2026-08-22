export interface Game {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly createdAt: Date;
}

export interface CreateGameInput {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

export interface GameMode {
  readonly id: string;
  readonly gameId: string;
  readonly name: string;
  readonly createdAt: Date;
}

export interface CreateGameModeInput {
  readonly id: string;
  readonly gameId: string;
  readonly name: string;
}

/** `games`/`game_modes` are ownerless catalog entities — plain finders, no ownership scoping. */
export interface GameRepository {
  create(input: CreateGameInput): Promise<Game>;
  findById(id: string): Promise<Game | null>;
  findBySlug(slug: string): Promise<Game | null>;
  list(): Promise<Game[]>;
  createMode(input: CreateGameModeInput): Promise<GameMode>;
  listModes(gameId: string): Promise<GameMode[]>;
}
