import { DomainError } from "@/domain/errors";
import { assertUserStatusTransition } from "@/domain/identity";
import type { AuditWriter, Clock, UnitOfWork, UserRecord, UserRepository } from "@/domain/ports";
import { userSuspendedEvent } from "@/application/audit/writer";

export interface AdminSuspendUserInput {
  readonly actorId: string;
  readonly userId: string;
}

export interface AdminSuspendUserDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

/**
 * T-903 — Security.md §7 sensitive operation (step-up + audit enforced by the route, not this
 * use case). Existing matched exposure keeps settling normally (FRAUD_PREVENTION.md §5); this
 * only blocks *new* activity, the same way SUSPENDED already blocks placement via
 * assertActiveAccount.
 */
export class AdminSuspendUserUseCase<Tx> {
  constructor(private readonly deps: AdminSuspendUserDeps<Tx>) {}

  async execute(input: AdminSuspendUserInput): Promise<UserRecord> {
    return this.deps.uow.run(async (tx) => {
      const users = this.deps.users(tx);
      const user = await users.findById(input.userId);
      if (!user) {
        throw new DomainError("RESOURCE_NOT_FOUND", "user not found", {
          details: { userId: input.userId },
        });
      }

      assertUserStatusTransition(user.status, "SUSPENDED");

      const now = this.deps.clock.now();
      await users.updateStatus(user.id, "SUSPENDED", now);
      await this.deps.audit.record(tx, userSuspendedEvent(input.actorId, user.id));

      return { ...user, status: "SUSPENDED" };
    });
  }
}
