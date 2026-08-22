export interface Match {
  readonly id: string;
  readonly tournamentId: string;
  readonly gameModeId: string;
  readonly scheduledAt: Date;
  readonly playedAt: Date | null;
  readonly createdAt: Date;
}

export interface CreateMatchInput {
  readonly id: string;
  readonly tournamentId: string;
  readonly gameModeId: string;
  readonly scheduledAt: Date;
}

export interface MatchParticipant {
  readonly matchId: string;
  readonly teamId: string;
  readonly side: string;
}

export interface AddMatchParticipantInput {
  readonly matchId: string;
  readonly teamId: string;
  readonly side: string;
}

/** `matches`/`match_participants` are ownerless catalog entities — plain finders, no ownership scoping. */
export interface MatchRepository {
  create(input: CreateMatchInput): Promise<Match>;
  findById(id: string): Promise<Match | null>;
  listByTournamentId(tournamentId: string): Promise<Match[]>;
  addParticipant(input: AddMatchParticipantInput): Promise<MatchParticipant>;
  listParticipants(matchId: string): Promise<MatchParticipant[]>;
}
