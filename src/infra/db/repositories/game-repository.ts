import { eq } from "drizzle-orm";
import type {
  CreateGameInput,
  CreateGameModeInput,
  Game,
  GameMode,
  GameRepository,
} from "@/domain/ports";
import { gameModes, games } from "../schema/catalog";
import type { DbTx } from "../uow";

/** `games`/`game_modes` are ownerless catalog entities — plain finders, unlike owner-scoped repositories. */
export class DrizzleGameRepository implements GameRepository {
  constructor(private readonly tx: DbTx) {}

  async create(input: CreateGameInput): Promise<Game> {
    const [row] = await this.tx
      .insert(games)
      .values({ id: input.id, slug: input.slug, name: input.name })
      .returning();

    if (!row) {
      throw new Error("insert into games returned no row");
    }
    return this.toGame(row);
  }

  async findById(id: string): Promise<Game | null> {
    const [row] = await this.tx.select().from(games).where(eq(games.id, id));
    return row ? this.toGame(row) : null;
  }

  async findBySlug(slug: string): Promise<Game | null> {
    const [row] = await this.tx.select().from(games).where(eq(games.slug, slug));
    return row ? this.toGame(row) : null;
  }

  async list(): Promise<Game[]> {
    const rows = await this.tx.select().from(games);
    return rows.map((row) => this.toGame(row));
  }

  async createMode(input: CreateGameModeInput): Promise<GameMode> {
    const [row] = await this.tx
      .insert(gameModes)
      .values({ id: input.id, gameId: input.gameId, name: input.name })
      .returning();

    if (!row) {
      throw new Error("insert into game_modes returned no row");
    }
    return this.toGameMode(row);
  }

  async listModes(gameId: string): Promise<GameMode[]> {
    const rows = await this.tx.select().from(gameModes).where(eq(gameModes.gameId, gameId));
    return rows.map((row) => this.toGameMode(row));
  }

  private toGame(row: typeof games.$inferSelect): Game {
    return { id: row.id, slug: row.slug, name: row.name, createdAt: row.createdAt };
  }

  private toGameMode(row: typeof gameModes.$inferSelect): GameMode {
    return { id: row.id, gameId: row.gameId, name: row.name, createdAt: row.createdAt };
  }
}
