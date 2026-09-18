import type { DbTx } from "@/infra/db";
import type {
  AuditWriter,
  Clock,
  IdGenerator,
  SelfExclusionRepository,
  UnitOfWork,
  UserRepository,
} from "@/domain/ports";
import { SelfExcludeUseCase, AdminUpdateUserStatusUseCase } from "@/application/compliance";

/** Split out of `container.ts` purely to keep that file under the repo's `max-lines` cap — same
 * rationale as `container-settlement.ts`, not a new architectural layer. */
export interface ComplianceContainerDeps {
  readonly uow: UnitOfWork<DbTx>;
  readonly users: (tx: DbTx) => UserRepository;
  readonly selfExclusions: (tx: DbTx, ownerId: string) => SelfExclusionRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<DbTx>;
}

export interface ComplianceUseCases<Tx> {
  readonly selfExclude: SelfExcludeUseCase<Tx>;
  readonly adminUpdateUserStatus: AdminUpdateUserStatusUseCase<Tx>;
}

export function buildComplianceUseCases(deps: ComplianceContainerDeps): ComplianceUseCases<DbTx> {
  return {
    selfExclude: new SelfExcludeUseCase<DbTx>(deps),
    adminUpdateUserStatus: new AdminUpdateUserStatusUseCase<DbTx>(deps),
  };
}
