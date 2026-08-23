import { DomainError } from "@/domain/errors";
import { assertValidBps } from "@/domain/money";
import type {
  AuditWriter,
  IdGenerator,
  Streamer,
  StreamerChannel,
  StreamerRepository,
  UnitOfWork,
  UserRepository,
} from "@/domain/ports";
import {
  streamerChannelCreatedEvent,
  streamerCommissionUpdatedEvent,
  streamerCreatedEvent,
} from "@/application/audit/writer";

export interface CreateStreamerInput {
  readonly actorId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly defaultCommissionBps: number;
}

export interface CreateStreamerDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
  readonly streamers: (tx: Tx) => StreamerRepository;
  readonly ids: IdGenerator;
  readonly audit: AuditWriter<Tx>;
}

/** Admin-only streamer registration (T-409). Links a catalog streamer record to an existing user. */
export class CreateStreamerUseCase<Tx> {
  constructor(private readonly deps: CreateStreamerDeps<Tx>) {}

  async execute(input: CreateStreamerInput): Promise<Streamer> {
    if (input.displayName.trim().length === 0) {
      throw new DomainError("VALIDATION_FAILED", "displayName must not be empty", {
        details: { field: "displayName" },
      });
    }
    assertValidBps(input.defaultCommissionBps);

    return this.deps.uow.run(async (tx) => {
      const user = await this.deps.users(tx).findById(input.userId);
      if (!user) {
        throw new DomainError("RESOURCE_NOT_FOUND", "user not found", {
          details: { userId: input.userId },
        });
      }

      const streamer = await this.deps.streamers(tx).create({
        id: this.deps.ids.next(),
        userId: input.userId,
        displayName: input.displayName,
        defaultCommissionBps: input.defaultCommissionBps,
      });

      await this.deps.audit.record(tx, streamerCreatedEvent(input.actorId, streamer.id));

      return streamer;
    });
  }
}

export interface UpdateStreamerCommissionInput {
  readonly actorId: string;
  readonly streamerId: string;
  readonly defaultCommissionBps: number;
}

export interface UpdateStreamerCommissionDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly streamers: (tx: Tx) => StreamerRepository;
  readonly audit: AuditWriter<Tx>;
}

/**
 * Admin-only commission update (T-409). Only changes the streamer's *default*
 * rate for markets created afterwards — every `EconomicProfile` already
 * referenced by an existing market is an immutable snapshot (RULE-F04) and is
 * never touched by this use case.
 */
export class UpdateStreamerCommissionUseCase<Tx> {
  constructor(private readonly deps: UpdateStreamerCommissionDeps<Tx>) {}

  async execute(input: UpdateStreamerCommissionInput): Promise<Streamer> {
    assertValidBps(input.defaultCommissionBps);

    return this.deps.uow.run(async (tx) => {
      const streamers = this.deps.streamers(tx);

      const existing = await streamers.findById(input.streamerId);
      if (!existing) {
        throw new DomainError("RESOURCE_NOT_FOUND", "streamer not found", {
          details: { streamerId: input.streamerId },
        });
      }

      const streamer = await streamers.updateDefaultCommissionBps(
        input.streamerId,
        input.defaultCommissionBps,
      );

      await this.deps.audit.record(tx, streamerCommissionUpdatedEvent(input.actorId, streamer.id));

      return streamer;
    });
  }
}

export interface CreateStreamerChannelInput {
  readonly actorId: string;
  readonly streamerId: string;
  readonly platform: string;
  readonly channelUrl: string;
}

export interface CreateStreamerChannelDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly streamers: (tx: Tx) => StreamerRepository;
  readonly ids: IdGenerator;
  readonly audit: AuditWriter<Tx>;
}

/** Admin-only channel registration for an existing streamer (T-409). */
export class CreateStreamerChannelUseCase<Tx> {
  constructor(private readonly deps: CreateStreamerChannelDeps<Tx>) {}

  async execute(input: CreateStreamerChannelInput): Promise<StreamerChannel> {
    if (input.platform.trim().length === 0) {
      throw new DomainError("VALIDATION_FAILED", "platform must not be empty", {
        details: { field: "platform" },
      });
    }
    if (input.channelUrl.trim().length === 0) {
      throw new DomainError("VALIDATION_FAILED", "channelUrl must not be empty", {
        details: { field: "channelUrl" },
      });
    }

    return this.deps.uow.run(async (tx) => {
      const streamers = this.deps.streamers(tx);

      const streamer = await streamers.findById(input.streamerId);
      if (!streamer) {
        throw new DomainError("RESOURCE_NOT_FOUND", "streamer not found", {
          details: { streamerId: input.streamerId },
        });
      }

      const channel = await streamers.createChannel({
        id: this.deps.ids.next(),
        streamerId: input.streamerId,
        platform: input.platform,
        channelUrl: input.channelUrl,
      });

      await this.deps.audit.record(tx, streamerChannelCreatedEvent(input.actorId, channel.id));

      return channel;
    });
  }
}
