import { DomainError } from "@/domain/errors";
import type { Clock, SessionRepository, UnitOfWork } from "@/domain/ports";

export interface RevokeSessionInput {
  readonly userId: string;
  readonly sessionId: string;
}

export interface RevokeSessionDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly sessions: (tx: Tx) => SessionRepository;
  readonly clock: Clock;
}

/**
 * Revokes exactly one session, but only if it belongs to the requesting user —
 * a session owned by someone else is reported as RESOURCE_NOT_FOUND (404), never
 * UNAUTHORIZED_OPERATION, so its existence isn't leaked across accounts.
 */
export class RevokeSessionUseCase<Tx> {
  constructor(private readonly deps: RevokeSessionDeps<Tx>) {}

  async execute(input: RevokeSessionInput): Promise<void> {
    const now = this.deps.clock.now();

    await this.deps.uow.run(async (tx) => {
      const sessions = this.deps.sessions(tx);
      const session = await sessions.findById(input.sessionId);

      if (session?.userId !== input.userId) {
        throw new DomainError("RESOURCE_NOT_FOUND", "session not found for this user", {
          details: { sessionId: input.sessionId },
        });
      }

      await sessions.revoke(session.id, now);
    });
  }
}
