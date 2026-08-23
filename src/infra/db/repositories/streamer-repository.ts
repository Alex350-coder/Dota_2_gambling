import { eq } from "drizzle-orm";
import type {
  CreateStreamerChannelInput,
  CreateStreamerInput,
  Streamer,
  StreamerChannel,
  StreamerRepository,
} from "@/domain/ports";
import { streamerChannels, streamers } from "../schema/catalog";
import type { DbTx } from "../uow";

export class DrizzleStreamerRepository implements StreamerRepository {
  constructor(private readonly tx: DbTx) {}

  async create(input: CreateStreamerInput): Promise<Streamer> {
    const [row] = await this.tx
      .insert(streamers)
      .values({
        id: input.id,
        userId: input.userId,
        displayName: input.displayName,
        defaultCommissionBps: input.defaultCommissionBps,
      })
      .returning();

    if (!row) {
      throw new Error("insert into streamers returned no row");
    }
    return this.toStreamer(row);
  }

  async findById(id: string): Promise<Streamer | null> {
    const [row] = await this.tx.select().from(streamers).where(eq(streamers.id, id));
    return row ? this.toStreamer(row) : null;
  }

  async updateDefaultCommissionBps(id: string, defaultCommissionBps: number): Promise<Streamer> {
    const [row] = await this.tx
      .update(streamers)
      .set({ defaultCommissionBps })
      .where(eq(streamers.id, id))
      .returning();

    if (!row) {
      throw new Error("update streamers returned no row");
    }
    return this.toStreamer(row);
  }

  async createChannel(input: CreateStreamerChannelInput): Promise<StreamerChannel> {
    const [row] = await this.tx
      .insert(streamerChannels)
      .values({
        id: input.id,
        streamerId: input.streamerId,
        platform: input.platform,
        channelUrl: input.channelUrl,
      })
      .returning();

    if (!row) {
      throw new Error("insert into streamer_channels returned no row");
    }
    return this.toChannel(row);
  }

  async listChannels(streamerId: string): Promise<StreamerChannel[]> {
    const rows = await this.tx
      .select()
      .from(streamerChannels)
      .where(eq(streamerChannels.streamerId, streamerId));
    return rows.map((row) => this.toChannel(row));
  }

  private toStreamer(row: typeof streamers.$inferSelect): Streamer {
    return {
      id: row.id,
      userId: row.userId,
      displayName: row.displayName,
      defaultCommissionBps: row.defaultCommissionBps,
      createdAt: row.createdAt,
    };
  }

  private toChannel(row: typeof streamerChannels.$inferSelect): StreamerChannel {
    return {
      id: row.id,
      streamerId: row.streamerId,
      platform: row.platform,
      channelUrl: row.channelUrl,
      createdAt: row.createdAt,
    };
  }
}
