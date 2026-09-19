import type { DbTx } from "@/infra/db";
import type {
  AuditWriter,
  BetOrderRepository,
  Clock,
  IdGenerator,
  LedgerWriter,
  UnitOfWork,
  UserRepository,
  WalletRepository,
} from "@/domain/ports";
import type { Config } from "@/platform/config";
import {
  GetWalletUseCase,
  ListTransactionsUseCase,
  SimulatedCreditUseCase,
} from "@/application/wallet";

/** Split out of `container.ts` purely to keep that file under the repo's `max-lines` cap —
 * same rationale as `container-settlement.ts`, not a new architectural layer. */
export interface WalletContainerDeps {
  readonly uow: UnitOfWork<DbTx>;
  readonly users: (tx: DbTx) => UserRepository;
  readonly wallets: (tx: DbTx, ownerId: string) => WalletRepository;
  readonly betOrders: (tx: DbTx, ownerId: string) => BetOrderRepository;
  readonly ledger: LedgerWriter<DbTx>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<DbTx>;
  readonly config: Pick<Config, "MONEY_MODE" | "SIMULATED_CREDIT_DAILY_CAP_MINOR">;
}

export interface WalletUseCases<Tx> {
  readonly simulatedCredit: SimulatedCreditUseCase<Tx>;
  readonly getWallet: GetWalletUseCase<Tx>;
  readonly listTransactions: ListTransactionsUseCase<Tx>;
}

export function buildWalletUseCases({
  config,
  betOrders,
  ...deps
}: WalletContainerDeps): WalletUseCases<DbTx> {
  return {
    simulatedCredit: new SimulatedCreditUseCase<DbTx>({
      ...deps,
      simulatedModeEnabled: config.MONEY_MODE === "SIMULATED",
      dailyCapMinor: BigInt(config.SIMULATED_CREDIT_DAILY_CAP_MINOR),
    }),
    getWallet: new GetWalletUseCase<DbTx>({ uow: deps.uow, wallets: deps.wallets, betOrders }),
    listTransactions: new ListTransactionsUseCase<DbTx>({ uow: deps.uow, ledger: deps.ledger }),
  };
}
