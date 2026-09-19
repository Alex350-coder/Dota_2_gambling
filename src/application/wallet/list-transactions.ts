import type { LedgerEntryRecord, LedgerWriter, UnitOfWork } from "@/domain/ports";
import { MAX_PAGE_SIZE, type Page, type PageInput } from "@/application/catalog/pagination";

export interface ListTransactionsInput extends PageInput {
  readonly userId: string;
  readonly currency: string;
}

export interface ListTransactionsDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly ledger: LedgerWriter<Tx>;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Owner-scoped, paginated read of a user's own `USER_AVAILABLE:<userId>` ledger entries
 * (T-805) — that account alone captures every balance-changing event (reserve, release,
 * settlement, faucet credit), so it gives a complete bank-statement-style view without also
 * reading the `USER_LOCKED` mirror entries. DB-level `LIMIT`/`OFFSET` (RULE-G04) since this
 * table is append-only and grows without bound, unlike the small catalog lists `paginate()`
 * slices in memory.
 */
export class ListTransactionsUseCase<Tx> {
  constructor(private readonly deps: ListTransactionsDeps<Tx>) {}

  async execute(input: ListTransactionsInput): Promise<Page<LedgerEntryRecord>> {
    const page = input.page !== undefined && input.page > 0 ? Math.floor(input.page) : 1;
    const limit =
      input.limit !== undefined && input.limit > 0
        ? Math.min(Math.floor(input.limit), MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    const accountKey = `USER_AVAILABLE:${input.userId}`;
    const { entries, total } = await this.deps.uow.run((tx) =>
      this.deps.ledger.listEntriesForAccount(tx, accountKey, input.currency, { page, limit }),
    );

    return { items: entries, total, page, limit };
  }
}
