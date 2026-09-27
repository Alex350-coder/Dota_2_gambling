import type { DbTx } from "@/infra/db";
import type {
  AuditWriter,
  BetOrderRepository,
  Clock,
  IdGenerator,
  MarketRepository,
  MarketResultRepository,
  MatchResultProvider,
  OutcomeRepository,
  RiskAlertRepository,
  UnitOfWork,
} from "@/domain/ports";
import {
  ProposeResultUseCase,
  ConfirmResultUseCase,
  DisputeResultUseCase,
  ResolveDisputeUseCase,
  GetMarketResultUseCase,
} from "@/application/results";

/**
 * Split out of `container.ts` purely to keep that file under the repo's `max-lines` cap — same
 * rationale as `container-settlement.ts`/`container-identity.ts`, not a new architectural layer.
 */
export interface ResultsContainerDeps {
  readonly uow: UnitOfWork<DbTx>;
  readonly markets: (tx: DbTx) => MarketRepository;
  readonly outcomes: (tx: DbTx) => OutcomeRepository;
  readonly marketResults: (tx: DbTx) => MarketResultRepository;
  readonly betOrders: (tx: DbTx, ownerId: string) => BetOrderRepository;
  readonly riskAlerts: (tx: DbTx) => RiskAlertRepository;
  readonly provider: MatchResultProvider;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<DbTx>;
}

export interface ResultsUseCases<Tx> {
  readonly proposeResult: ProposeResultUseCase<Tx>;
  readonly confirmResult: ConfirmResultUseCase<Tx>;
  readonly disputeResult: DisputeResultUseCase<Tx>;
  readonly resolveDispute: ResolveDisputeUseCase<Tx>;
  readonly getMarketResult: GetMarketResultUseCase<Tx>;
}

export function buildResultsUseCases(deps: ResultsContainerDeps): ResultsUseCases<DbTx> {
  const {
    uow,
    markets,
    outcomes,
    marketResults,
    betOrders,
    riskAlerts,
    provider,
    ids,
    clock,
    audit,
  } = deps;

  return {
    proposeResult: new ProposeResultUseCase<DbTx>({
      uow,
      markets,
      outcomes,
      marketResults,
      betOrders,
      riskAlerts,
      provider,
      ids,
      clock,
      audit,
    }),
    confirmResult: new ConfirmResultUseCase<DbTx>({
      uow,
      marketResults,
      betOrders,
      riskAlerts,
      ids,
      clock,
      audit,
    }),
    disputeResult: new DisputeResultUseCase<DbTx>({ uow, marketResults, audit }),
    resolveDispute: new ResolveDisputeUseCase<DbTx>({
      uow,
      outcomes,
      marketResults,
      betOrders,
      riskAlerts,
      providerKey: provider.key,
      ids,
      clock,
      audit,
    }),
    getMarketResult: new GetMarketResultUseCase<DbTx>({ uow, marketResults }),
  };
}
