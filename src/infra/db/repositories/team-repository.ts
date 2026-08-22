import { eq } from "drizzle-orm";
import type { CreateTeamInput, Team, TeamRepository } from "@/domain/ports";
import { teams } from "../schema/catalog";
import type { DbTx } from "../uow";

/** `teams` is an ownerless catalog entity — a plain finder, unlike owner-scoped repositories. */
export class DrizzleTeamRepository implements TeamRepository {
  constructor(private readonly tx: DbTx) {}

  async create(input: CreateTeamInput): Promise<Team> {
    const [row] = await this.tx
      .insert(teams)
      .values({ id: input.id, gameId: input.gameId, name: input.name })
      .returning();

    if (!row) {
      throw new Error("insert into teams returned no row");
    }
    return this.toTeam(row);
  }

  async findById(id: string): Promise<Team | null> {
    const [row] = await this.tx.select().from(teams).where(eq(teams.id, id));
    return row ? this.toTeam(row) : null;
  }

  async listByGameId(gameId: string): Promise<Team[]> {
    const rows = await this.tx.select().from(teams).where(eq(teams.gameId, gameId));
    return rows.map((row) => this.toTeam(row));
  }

  private toTeam(row: typeof teams.$inferSelect): Team {
    return { id: row.id, gameId: row.gameId, name: row.name, createdAt: row.createdAt };
  }
}
