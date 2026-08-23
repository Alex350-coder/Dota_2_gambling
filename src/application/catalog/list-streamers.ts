import { DomainError } from "@/domain/errors";
import type { Streamer, StreamerRepository, UnitOfWork } from "@/domain/ports";
import { type Page, type PageInput, paginate } from "./pagination";

export interface ListStreamersDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly streamers: (tx: Tx) => StreamerRepository;
}

/** Public, unauthenticated streamer listing (T-410). */
export class ListStreamersUseCase<Tx> {
  constructor(private readonly deps: ListStreamersDeps<Tx>) {}

  async execute(input: PageInput): Promise<Page<Streamer>> {
    const all = await this.deps.uow.run((tx) => this.deps.streamers(tx).list());
    return paginate(all, input);
  }
}

export interface GetStreamerInput {
  readonly id: string;
}

export interface GetStreamerDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly streamers: (tx: Tx) => StreamerRepository;
}

/** Public, unauthenticated streamer detail lookup (T-410). Commission bps is disclosed intentionally. */
export class GetStreamerUseCase<Tx> {
  constructor(private readonly deps: GetStreamerDeps<Tx>) {}

  async execute(input: GetStreamerInput): Promise<Streamer> {
    const streamer = await this.deps.uow.run((tx) => this.deps.streamers(tx).findById(input.id));
    if (!streamer) {
      throw new DomainError("RESOURCE_NOT_FOUND", "streamer not found", {
        details: { streamerId: input.id },
      });
    }
    return streamer;
  }
}
