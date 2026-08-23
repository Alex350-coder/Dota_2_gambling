export interface Streamer {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly defaultCommissionBps: number;
  readonly createdAt: Date;
}

export interface CreateStreamerInput {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly defaultCommissionBps: number;
}

export interface StreamerChannel {
  readonly id: string;
  readonly streamerId: string;
  readonly platform: string;
  readonly channelUrl: string;
  readonly createdAt: Date;
}

export interface CreateStreamerChannelInput {
  readonly id: string;
  readonly streamerId: string;
  readonly platform: string;
  readonly channelUrl: string;
}

/** `streamers`/`streamer_channels` are ownerless from the catalog's perspective — a streamer's `userId` links to the account that owns the channel, but admin manages the catalog record. */
export interface StreamerRepository {
  create(input: CreateStreamerInput): Promise<Streamer>;
  findById(id: string): Promise<Streamer | null>;
  updateDefaultCommissionBps(id: string, defaultCommissionBps: number): Promise<Streamer>;
  createChannel(input: CreateStreamerChannelInput): Promise<StreamerChannel>;
  listChannels(streamerId: string): Promise<StreamerChannel[]>;
}
