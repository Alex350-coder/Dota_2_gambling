import { eq } from "drizzle-orm";
import type {
  AddMatchParticipantInput,
  CreateMatchInput,
  Match,
  MatchParticipant,
  MatchRepository,
} from "@/domain/ports";
import { matchParticipants, matches } from "../schema/catalog";
import type { DbTx } from "../uow";

/** `matches`/`match_participants` are ownerless catalog entities — plain finders, unlike owner-scoped repositories. */
export class DrizzleMatchRepository implements MatchRepository {
  constructor(private readonly tx: DbTx) {}

  async create(input: CreateMatchInput): Promise<Match> {
    const [row] = await this.tx
      .insert(matches)
      .values({
        id: input.id,
        tournamentId: input.tournamentId,
        gameModeId: input.gameModeId,
        scheduledAt: input.scheduledAt,
      })
      .returning();

    if (!row) {
      throw new Error("insert into matches returned no row");
    }
    return this.toMatch(row);
  }

  async findById(id: string): Promise<Match | null> {
    const [row] = await this.tx.select().from(matches).where(eq(matches.id, id));
    return row ? this.toMatch(row) : null;
  }

  async list(): Promise<Match[]> {
    const rows = await this.tx.select().from(matches);
    return rows.map((row) => this.toMatch(row));
  }

  async listByTournamentId(tournamentId: string): Promise<Match[]> {
    const rows = await this.tx.select().from(matches).where(eq(matches.tournamentId, tournamentId));
    return rows.map((row) => this.toMatch(row));
  }

  async addParticipant(input: AddMatchParticipantInput): Promise<MatchParticipant> {
    const [row] = await this.tx
      .insert(matchParticipants)
      .values({ matchId: input.matchId, teamId: input.teamId, side: input.side })
      .returning();

    if (!row) {
      throw new Error("insert into match_participants returned no row");
    }
    return { matchId: row.matchId, teamId: row.teamId, side: row.side };
  }

  async listParticipants(matchId: string): Promise<MatchParticipant[]> {
    const rows = await this.tx
      .select()
      .from(matchParticipants)
      .where(eq(matchParticipants.matchId, matchId));

    return rows.map((row) => ({ matchId: row.matchId, teamId: row.teamId, side: row.side }));
  }

  private toMatch(row: typeof matches.$inferSelect): Match {
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      gameModeId: row.gameModeId,
      scheduledAt: row.scheduledAt,
      playedAt: row.playedAt,
      createdAt: row.createdAt,
    };
  }
}
