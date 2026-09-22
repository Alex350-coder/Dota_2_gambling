import { DomainError } from "@/domain/errors";
import { assertUserStatusTransition } from "@/domain/identity";
import type { AuditWriter, Clock, UnitOfWork, UserRecord, UserRepository } from "@/domain/ports";
import { userRestoredEvent } from "@/application/audit/writer";

export interface AdminRestoreUserInput {
  readonly actorId: string;
  readonly userId: string;
}

export interface AdminRestoreUserDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

/** T-903 — reverses AdminSuspendUserUseCase; only lifts an admin-imposed SUSPENDED status,
 * never self-exclusion or account closure (assertUserStatusTransition enforces this). */
export class AdminRestoreUserUseCase<Tx> {
  constructor(private readonly deps: AdminRestoreUserDeps<Tx>) {}

  async execute(input: AdminRestoreUserInput): Promise<UserRecord> {
    return this.deps.uow.run(async (tx) => {
      const users = this.deps.users(tx);
      const user = await users.findById(input.userId);
      if (!user) {
        throw new DomainError("RESOURCE_NOT_FOUND", "user not found", {
          details: { userId: input.userId },
        });
      }

      assertUserStatusTransition(user.status, "ACTIVE");

      const now = this.deps.clock.now();
      await users.updateStatus(user.id, "ACTIVE", now);
      await this.deps.audit.record(tx, userRestoredEvent(input.actorId, user.id));

      return { ...user, status: "ACTIVE" };
    });
  }
}
