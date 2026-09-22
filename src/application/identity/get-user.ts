import { DomainError } from "@/domain/errors";
import type { AuditWriter, UnitOfWork, UserRecord, UserRepository } from "@/domain/ports";
import { adminUserReadEvent } from "@/application/audit/writer";

export interface GetUserInput {
  readonly actorId: string;
  readonly userId: string;
}

export interface GetUserDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
  readonly audit: AuditWriter<Tx>;
}

/** Admin single-user detail read (T-903) — audited every time (OBSERVABILITY.md §1). */
export class GetUserUseCase<Tx> {
  constructor(private readonly deps: GetUserDeps<Tx>) {}

  async execute(input: GetUserInput): Promise<UserRecord> {
    return this.deps.uow.run(async (tx) => {
      const user = await this.deps.users(tx).findById(input.userId);
      if (!user) {
        throw new DomainError("RESOURCE_NOT_FOUND", "user not found", {
          details: { userId: input.userId },
        });
      }

      await this.deps.audit.record(tx, adminUserReadEvent(input.actorId, user.id));
      return user;
    });
  }
}
