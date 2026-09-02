import { DomainError } from "@/domain/errors";
import type { SettlementRun, SettlementRunRepository, UnitOfWork } from "@/domain/ports";
import { type Page, type PageInput, paginate } from "@/application/catalog/pagination";

export interface ListSettlementRunsDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly settlementRuns: (tx: Tx) => SettlementRunRepository;
}

/** Admin settlement-run listing (T-613), same in-memory pagination shape as `ListMarketsUseCase`. */
export class ListSettlementRunsUseCase<Tx> {
  constructor(private readonly deps: ListSettlementRunsDeps<Tx>) {}

  async execute(input: PageInput): Promise<Page<SettlementRun>> {
    const all = await this.deps.uow.run((tx) => this.deps.settlementRuns(tx).list());
    return paginate(all, input);
  }
}

export interface GetSettlementRunInput {
  readonly id: string;
}

export interface GetSettlementRunDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly settlementRuns: (tx: Tx) => SettlementRunRepository;
}

/** Admin settlement-run detail lookup (T-613). */
export class GetSettlementRunUseCase<Tx> {
  constructor(private readonly deps: GetSettlementRunDeps<Tx>) {}

  async execute(input: GetSettlementRunInput): Promise<SettlementRun> {
    const run = await this.deps.uow.run((tx) => this.deps.settlementRuns(tx).findById(input.id));
    if (!run) {
      throw new DomainError("RESOURCE_NOT_FOUND", "settlement run not found", {
        details: { settlementRunId: input.id },
      });
    }
    return run;
  }
}
