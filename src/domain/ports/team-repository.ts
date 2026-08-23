export interface Team {
  readonly id: string;
  readonly gameId: string;
  readonly name: string;
  readonly createdAt: Date;
}

export interface CreateTeamInput {
  readonly id: string;
  readonly gameId: string;
  readonly name: string;
}

/** `teams` is an ownerless catalog entity — a plain finder, no ownership scoping. */
export interface TeamRepository {
  create(input: CreateTeamInput): Promise<Team>;
  findById(id: string): Promise<Team | null>;
  listByGameId(gameId: string): Promise<Team[]>;
}
