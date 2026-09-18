import { DomainError } from "@/domain/errors";
import { selfExclusionRevocableAt, type SelfExclusionPeriod } from "@/domain/compliance";
import type {
  AuditWriter,
  Clock,
  IdGenerator,
  SelfExclusionRepository,
  UnitOfWork,
  UserRepository,
} from "@/domain/ports";
import { selfExcludedEvent } from "@/application/audit/writer";

export interface SelfExcludeInput {
  readonly userId: string;
  readonly period: SelfExclusionPeriod;
}

export interface SelfExcludeResult {
  readonly revocableAt: Date | null;
}

export interface SelfExcludeDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
  readonly selfExclusions: (tx: Tx, ownerId: string) => SelfExclusionRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

/**
 * User-initiated self-exclusion (RESPONSIBLE_GAMBLING.md §3): records an append-only history
 * entry, then sets `users.status = SELF_EXCLUDED` + `revocableAt` so `assertActiveAccount`
 * (already wired into every placement/deposit path) blocks the account immediately. Irrevocable
 * before `revocableAt` — enforced separately by `assertAdminCanChangeStatus`, not here, since
 * this use case never lowers the protection, only raises it.
 */
export class SelfExcludeUseCase<Tx> {
  constructor(private readonly deps: SelfExcludeDeps<Tx>) {}

  async execute(input: SelfExcludeInput): Promise<SelfExcludeResult> {
    return this.deps.uow.run(async (tx) => {
      const user = await this.deps.users(tx).findById(input.userId);
      if (!user) {
        throw new DomainError("RESOURCE_NOT_FOUND", "user not found", {
          details: { userId: input.userId },
        });
      }

      const now = this.deps.clock.now();
      const revocableAt = selfExclusionRevocableAt(input.period, now);

      await this.deps.selfExclusions(tx, input.userId).create({
        id: this.deps.ids.next(),
        userId: input.userId,
        period: input.period,
        startedAt: now,
        revocableAt,
      });

      await this.deps.users(tx).setSelfExcluded(input.userId, revocableAt, now);
      await this.deps.audit.record(tx, selfExcludedEvent(input.userId, input.period));

      return { revocableAt };
    });
  }
}
