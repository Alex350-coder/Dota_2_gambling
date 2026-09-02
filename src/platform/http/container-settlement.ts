import { pgAdvisoryXactLock, type DbTx } from "@/infra/db";
import type {
  AllocationRepository,
  AuditWriter,
  BetOrderRepository,
  BookRepository,
  Clock,
  EconomicProfileRepository,
  IdGenerator,
  LedgerWriter,
  MarketRepository,
  MarketResultRepository,
  SettlementRunRepository,
  UnitOfWork,
} from "@/domain/ports";
import {
  SettleMarketUseCase,
  VoidMarketUseCase,
  ListSettlementRunsUseCase,
  GetSettlementRunUseCase,
} from "@/application/settlement";

/**
 * The settle/void/list/get quartet shares almost every dependency (`SettleMarketDeps` and
 * `VoidMarketDeps` are near-identical supersets of each other). Split out of `container.ts`
 * (T-613) purely to keep that file under the repo's `max-lines` cap — this is a composition
 * detail, not a new architectural layer.
 */
export interface SettlementContainerDeps {
  readonly uow: UnitOfWork<DbTx>;
  readonly markets: (tx: DbTx) => MarketRepository;
  readonly marketResults: (tx: DbTx) => MarketResultRepository;
  readonly settlementRuns: (tx: DbTx) => SettlementRunRepository;
  readonly allocations: (tx: DbTx) => AllocationRepository;
  readonly book: (tx: DbTx) => BookRepository;
  readonly betOrders: (tx: DbTx, ownerId: string) => BetOrderRepository;
  readonly economicProfiles: (tx: DbTx) => EconomicProfileRepository;
  readonly ledger: LedgerWriter<DbTx>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<DbTx>;
}

export interface SettlementUseCases<Tx> {
  readonly settleMarket: SettleMarketUseCase<Tx>;
  readonly voidMarket: VoidMarketUseCase<Tx>;
  readonly listSettlementRuns: ListSettlementRunsUseCase<Tx>;
  readonly getSettlementRun: GetSettlementRunUseCase<Tx>;
}

export function buildSettlementUseCases(deps: SettlementContainerDeps): SettlementUseCases<DbTx> {
  const acquireMarketLock = (tx: DbTx, marketId: string) =>
    pgAdvisoryXactLock(tx, `market:${marketId}`);

  return {
    settleMarket: new SettleMarketUseCase<DbTx>({ ...deps, acquireMarketLock }),
    voidMarket: new VoidMarketUseCase<DbTx>({ ...deps, acquireMarketLock }),
    listSettlementRuns: new ListSettlementRunsUseCase<DbTx>(deps),
    getSettlementRun: new GetSettlementRunUseCase<DbTx>(deps),
  };
}
