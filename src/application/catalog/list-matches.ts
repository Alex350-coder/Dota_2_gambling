import { DomainError } from "@/domain/errors";
import type { Match, MatchRepository, UnitOfWork } from "@/domain/ports";
import { type Page, type PageInput, paginate } from "./pagination";

export interface ListMatchesDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly matches: (tx: Tx) => MatchRepository;
}

/** Public, unauthenticated match listing (T-410). */
export class ListMatchesUseCase<Tx> {
  constructor(private readonly deps: ListMatchesDeps<Tx>) {}

  async execute(input: PageInput): Promise<Page<Match>> {
    const all = await this.deps.uow.run((tx) => this.deps.matches(tx).list());
    return paginate(all, input);
  }
}

export interface GetMatchInput {
  readonly id: string;
}

export interface GetMatchDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly matches: (tx: Tx) => MatchRepository;
}

/** Public, unauthenticated match detail lookup (T-410). */
export class GetMatchUseCase<Tx> {
  constructor(private readonly deps: GetMatchDeps<Tx>) {}

  async execute(input: GetMatchInput): Promise<Match> {
    const match = await this.deps.uow.run((tx) => this.deps.matches(tx).findById(input.id));
    if (!match) {
      throw new DomainError("RESOURCE_NOT_FOUND", "match not found", {
        details: { matchId: input.id },
      });
    }
    return match;
  }
}
