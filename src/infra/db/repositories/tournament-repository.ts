import { eq } from "drizzle-orm";
import type { CreateTournamentInput, Tournament, TournamentRepository } from "@/domain/ports";
import { tournaments } from "../schema/catalog";
import type { DbTx } from "../uow";

/** `tournaments` is an ownerless catalog entity — a plain finder, unlike owner-scoped repositories. */
export class DrizzleTournamentRepository implements TournamentRepository {
  constructor(private readonly tx: DbTx) {}

  async create(input: CreateTournamentInput): Promise<Tournament> {
    const [row] = await this.tx
      .insert(tournaments)
      .values({
        id: input.id,
        gameId: input.gameId,
        name: input.name,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
      })
      .returning();

    if (!row) {
      throw new Error("insert into tournaments returned no row");
    }
    return this.toTournament(row);
  }

  async findById(id: string): Promise<Tournament | null> {
    const [row] = await this.tx.select().from(tournaments).where(eq(tournaments.id, id));
    return row ? this.toTournament(row) : null;
  }

  async listByGameId(gameId: string): Promise<Tournament[]> {
    const rows = await this.tx.select().from(tournaments).where(eq(tournaments.gameId, gameId));
    return rows.map((row) => this.toTournament(row));
  }

  private toTournament(row: typeof tournaments.$inferSelect): Tournament {
    return {
      id: row.id,
      gameId: row.gameId,
      name: row.name,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      createdAt: row.createdAt,
    };
  }
}
