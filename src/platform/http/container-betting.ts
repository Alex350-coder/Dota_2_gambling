import { pgAdvisoryXactLock, type DbTx } from "@/infra/db";
import type {
  AllocationRepository,
  AuditWriter,
  BetOrderRepository,
  BetSlipRepository,
  BookRepository,
  Clock,
  EconomicProfileRepository,
  IdGenerator,
  LedgerWriter,
  MarketRepository,
  OutcomeRepository,
  RgLimitRepository,
  StreamerRepository,
  UnitOfWork,
  UserRepository,
  WalletRepository,
} from "@/domain/ports";
import {
  PlaceOrderUseCase,
  CancelOrderUseCase,
  ListBetsUseCase,
  GetBetUseCase,
} from "@/application/betting";

/**
 * Split out of `container.ts` purely to keep that file under the repo's `max-lines` cap — this is
 * a composition detail, not a new architectural layer (same rationale as
 * `container-settlement.ts`).
 */
export interface BettingContainerDeps {
  readonly uow: UnitOfWork<DbTx>;
  readonly markets: (tx: DbTx) => MarketRepository;
  readonly outcomes: (tx: DbTx) => OutcomeRepository;
  readonly economicProfiles: (tx: DbTx) => EconomicProfileRepository;
  readonly streamers: (tx: DbTx) => StreamerRepository;
  readonly users: (tx: DbTx) => UserRepository;
  readonly wallets: (tx: DbTx, ownerId: string) => WalletRepository;
  readonly betSlips: (tx: DbTx, ownerId: string) => BetSlipRepository;
  readonly betOrders: (tx: DbTx, ownerId: string) => BetOrderRepository;
  readonly book: (tx: DbTx) => BookRepository;
  readonly allocations: (tx: DbTx) => AllocationRepository;
  readonly allocationsForOwner: (tx: DbTx, ownerId: string) => AllocationRepository;
  readonly rgLimits: (tx: DbTx, ownerId: string) => RgLimitRepository;
  readonly ledger: LedgerWriter<DbTx>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<DbTx>;
}

export interface BettingUseCases<Tx> {
  readonly placeOrder: PlaceOrderUseCase<Tx>;
  readonly cancelOrder: CancelOrderUseCase<Tx>;
  readonly listBets: ListBetsUseCase<Tx>;
  readonly getBet: GetBetUseCase<Tx>;
}

export function buildBettingUseCases({
  allocationsForOwner,
  ...deps
}: BettingContainerDeps): BettingUseCases<DbTx> {
  const acquireMarketLock = (tx: DbTx, marketId: string) =>
    pgAdvisoryXactLock(tx, `market:${marketId}`);

  return {
    placeOrder: new PlaceOrderUseCase<DbTx>({ ...deps, acquireMarketLock }),
    cancelOrder: new CancelOrderUseCase<DbTx>(deps),
    listBets: new ListBetsUseCase<DbTx>(deps),
    getBet: new GetBetUseCase<DbTx>({ ...deps, allocations: allocationsForOwner }),
  };
}
