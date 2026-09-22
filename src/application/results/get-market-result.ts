import type { MarketResult, MarketResultRepository, UnitOfWork } from "@/domain/ports";

export interface GetMarketResultInput {
  readonly marketId: string;
}

export interface GetMarketResultDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly marketResults: (tx: Tx) => MarketResultRepository;
}

/**
 * Read-only lookup of a market's current (non-superseded) result (T-905) — the admin results
 * page needs this to decide whether to render Propose or Confirm/Dispute, and to compare the
 * viewing admin's own id against `proposedBy` so the 4-eyes rule is reflected in the UI, not
 * just enforced server-side by ConfirmResultUseCase.
 */
export class GetMarketResultUseCase<Tx> {
  constructor(private readonly deps: GetMarketResultDeps<Tx>) {}

  async execute(input: GetMarketResultInput): Promise<MarketResult | null> {
    return this.deps.uow.run((tx) =>
      this.deps.marketResults(tx).findCurrentByMarketId(input.marketId),
    );
  }
}
