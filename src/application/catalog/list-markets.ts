import { DomainError } from "@/domain/errors";
import type { Market, MarketRepository, UnitOfWork } from "@/domain/ports";
import { type Page, type PageInput, paginate } from "./pagination";

export interface ListMarketsDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly markets: (tx: Tx) => MarketRepository;
}

/** Public, unauthenticated market listing (T-410). */
export class ListMarketsUseCase<Tx> {
  constructor(private readonly deps: ListMarketsDeps<Tx>) {}

  async execute(input: PageInput): Promise<Page<Market>> {
    const all = await this.deps.uow.run((tx) => this.deps.markets(tx).list());
    return paginate(all, input);
  }
}

export interface GetMarketInput {
  readonly id: string;
}

export interface GetMarketDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly markets: (tx: Tx) => MarketRepository;
}

/** Public, unauthenticated market detail lookup (T-410). */
export class GetMarketUseCase<Tx> {
  constructor(private readonly deps: GetMarketDeps<Tx>) {}

  async execute(input: GetMarketInput): Promise<Market> {
    const market = await this.deps.uow.run((tx) => this.deps.markets(tx).findById(input.id));
    if (!market) {
      throw new DomainError("RESOURCE_NOT_FOUND", "market not found", {
        details: { marketId: input.id },
      });
    }
    return market;
  }
}
