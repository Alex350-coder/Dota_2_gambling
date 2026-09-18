import { DomainError } from "@/domain/errors";
import { assertAdminCanChangeStatus } from "@/domain/compliance";
import type { AuditWriter, Clock, UnitOfWork, UserRepository, UserStatus } from "@/domain/ports";
import {
  selfExclusionShortenRejectedEvent,
  userStatusChangedEvent,
} from "@/application/audit/writer";

export interface AdminUpdateUserStatusInput {
  readonly adminId: string;
  readonly userId: string;
  readonly status: UserStatus;
}

export interface AdminUpdateUserStatusDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

/**
 * The only admin-facing status-change path (T-810): exists specifically to prove
 * RESPONSIBLE_GAMBLING.md §3's "no admin may shorten [a self-exclusion]" rule end-to-end. Any
 * attempt to change a still-irrevocable SELF_EXCLUDED account's status — to any value, not just
 * ACTIVE — is rejected and audit-logged before the domain error is thrown.
 */
export class AdminUpdateUserStatusUseCase<Tx> {
  constructor(private readonly deps: AdminUpdateUserStatusDeps<Tx>) {}

  async execute(input: AdminUpdateUserStatusInput): Promise<void> {
    const user = await this.deps.uow.run((tx) => this.deps.users(tx).findById(input.userId));
    if (!user) {
      throw new DomainError("RESOURCE_NOT_FOUND", "user not found", {
        details: { userId: input.userId },
      });
    }

    const now = this.deps.clock.now();
    try {
      assertAdminCanChangeStatus(user, now);
    } catch (error) {
      // Recorded in its own transaction: the rejection must survive even though nothing else
      // in this attempt is persisted (mirrors LoginUseCase's failed-attempt audit pattern).
      await this.deps.uow.run((tx) =>
        this.deps.audit.record(tx, selfExclusionShortenRejectedEvent(input.adminId, input.userId)),
      );
      throw error;
    }

    await this.deps.uow.run(async (tx) => {
      await this.deps.users(tx).updateStatus(input.userId, input.status, now);
      await this.deps.audit.record(
        tx,
        userStatusChangedEvent(input.adminId, input.userId, input.status),
      );
    });
  }
}
