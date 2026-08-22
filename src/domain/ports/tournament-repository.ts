export interface Tournament {
  readonly id: string;
  readonly gameId: string;
  readonly name: string;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly createdAt: Date;
}

export interface CreateTournamentInput {
  readonly id: string;
  readonly gameId: string;
  readonly name: string;
  readonly startsAt: Date;
  readonly endsAt?: Date | null;
}

/** `tournaments` is an ownerless catalog entity — a plain finder, no ownership scoping. */
export interface TournamentRepository {
  create(input: CreateTournamentInput): Promise<Tournament>;
  findById(id: string): Promise<Tournament | null>;
  listByGameId(gameId: string): Promise<Tournament[]>;
}
