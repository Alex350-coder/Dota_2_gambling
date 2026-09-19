import type { AuditWriter, Clock, SessionRepository, UnitOfWork } from "@/domain/ports";
import { allOtherSessionsRevokedEvent } from "@/application/audit/writer";

export interface RevokeAllSessionsInput {
  readonly userId: string;
  /** The caller's own session, kept alive — "sign out everywhere else", not everywhere (T-803). */
  readonly exceptSessionId: string;
}

export interface RevokeAllSessionsDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly sessions: (tx: Tx) => SessionRepository;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

/** Distinct from RevokeSessionUseCase (single session by id) — this signs out every other
 * active session for the account in one call, mirroring the side effect ChangePasswordUseCase
 * and ResetPasswordUseCase already apply automatically. */
export class RevokeAllSessionsUseCase<Tx> {
  constructor(private readonly deps: RevokeAllSessionsDeps<Tx>) {}

  async execute(input: RevokeAllSessionsInput): Promise<void> {
    const now = this.deps.clock.now();
    await this.deps.uow.run(async (tx) => {
      await this.deps.sessions(tx).revokeAllForUser(input.userId, now, input.exceptSessionId);
      await this.deps.audit.record(tx, allOtherSessionsRevokedEvent(input.userId));
    });
  }
}
