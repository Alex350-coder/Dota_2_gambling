import type { DbTx } from "@/infra/db";
import type {
  AuditWriter,
  Clock,
  IdGenerator,
  LedgerWriter,
  RgLimitRepository,
  SelfExclusionRepository,
  SessionRepository,
  UnitOfWork,
  UserRepository,
} from "@/domain/ports";
import {
  SelfExcludeUseCase,
  AdminUpdateUserStatusUseCase,
  ActivitySummaryUseCase,
  ListLimitsUseCase,
  UpdateLimitUseCase,
} from "@/application/compliance";

/** Split out of `container.ts` purely to keep that file under the repo's `max-lines` cap — same
 * rationale as `container-settlement.ts`, not a new architectural layer. */
export interface ComplianceContainerDeps {
  readonly uow: UnitOfWork<DbTx>;
  readonly users: (tx: DbTx) => UserRepository;
  readonly selfExclusions: (tx: DbTx, ownerId: string) => SelfExclusionRepository;
  readonly rgLimits: (tx: DbTx, ownerId: string) => RgLimitRepository;
  readonly sessions: (tx: DbTx) => SessionRepository;
  readonly ledger: LedgerWriter<DbTx>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<DbTx>;
}

export interface ComplianceUseCases<Tx> {
  readonly selfExclude: SelfExcludeUseCase<Tx>;
  readonly adminUpdateUserStatus: AdminUpdateUserStatusUseCase<Tx>;
  readonly activitySummary: ActivitySummaryUseCase<Tx>;
  readonly listLimits: ListLimitsUseCase<Tx>;
  readonly updateLimit: UpdateLimitUseCase<Tx>;
}

export function buildComplianceUseCases(deps: ComplianceContainerDeps): ComplianceUseCases<DbTx> {
  return {
    selfExclude: new SelfExcludeUseCase<DbTx>(deps),
    adminUpdateUserStatus: new AdminUpdateUserStatusUseCase<DbTx>(deps),
    activitySummary: new ActivitySummaryUseCase<DbTx>({
      uow: deps.uow,
      ledger: deps.ledger,
      sessions: deps.sessions,
      clock: deps.clock,
    }),
    listLimits: new ListLimitsUseCase<DbTx>({
      uow: deps.uow,
      rgLimits: deps.rgLimits,
      clock: deps.clock,
    }),
    updateLimit: new UpdateLimitUseCase<DbTx>({
      uow: deps.uow,
      rgLimits: deps.rgLimits,
      clock: deps.clock,
    }),
  };
}
