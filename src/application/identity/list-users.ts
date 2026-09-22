import type { UnitOfWork, UserRecord, UserRepository } from "@/domain/ports";
import { paginate, type Page, type PageInput } from "@/application/catalog/pagination";

export interface ListUsersDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly users: (tx: Tx) => UserRepository;
}

/**
 * Admin user listing (T-903). Not individually audited — same convention as
 * ListGamesUseCase/ListMarketsUseCase; only a *specific* user's detail read is audited
 * (GetUserUseCase), matching OBSERVABILITY.md §1's "admin reads of another user's data".
 */
export class ListUsersUseCase<Tx> {
  constructor(private readonly deps: ListUsersDeps<Tx>) {}

  async execute(input: PageInput): Promise<Page<UserRecord>> {
    const all = await this.deps.uow.run((tx) => this.deps.users(tx).list());
    return paginate(all, input);
  }
}
