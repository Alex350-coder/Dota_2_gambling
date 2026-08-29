import type { BetOrder, BetOrderStatus } from "@/domain/betting";
import type { BetOrderRepository, UnitOfWork } from "@/domain/ports";
import { type Page, type PageInput, paginate } from "@/application/catalog/pagination";

export interface ListBetsInput extends PageInput {
  readonly actorId: string;
  readonly status?: BetOrderStatus | undefined;
  readonly marketId?: string | undefined;
}

export interface ListBetsDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly betOrders: (tx: Tx, ownerId: string) => BetOrderRepository;
}

/** Owner-scoped, paginated listing of the caller's own orders (T-513). */
export class ListBetsUseCase<Tx> {
  constructor(private readonly deps: ListBetsDeps<Tx>) {}

  async execute(input: ListBetsInput): Promise<Page<BetOrder>> {
    const all = await this.deps.uow.run((tx) =>
      this.deps
        .betOrders(tx, input.actorId)
        .listByOwner({ status: input.status, marketId: input.marketId }),
    );
    return paginate(all, input);
  }
}
