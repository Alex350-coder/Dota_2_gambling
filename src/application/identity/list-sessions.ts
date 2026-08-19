import type { Clock, SessionRecord, SessionRepository, UnitOfWork } from "@/domain/ports";

export interface ListSessionsInput {
  readonly userId: string;
}

export interface ListSessionsDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly sessions: (tx: Tx) => SessionRepository;
  readonly clock: Clock;
}

/** Lists only the caller's own active (non-revoked, non-expired) sessions. */
export class ListSessionsUseCase<Tx> {
  constructor(private readonly deps: ListSessionsDeps<Tx>) {}

  async execute(input: ListSessionsInput): Promise<readonly SessionRecord[]> {
    const now = this.deps.clock.now();
    return this.deps.uow.run((tx) => this.deps.sessions(tx).listActiveByUserId(input.userId, now));
  }
}
