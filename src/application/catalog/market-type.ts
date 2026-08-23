import { DomainError } from "@/domain/errors";
import { assertSupportedByEconomicModel, type OutcomeCardinality } from "@/domain/catalog";
import type {
  AuditWriter,
  IdGenerator,
  MarketTypeRepository,
  PersistedMarketType,
  UnitOfWork,
} from "@/domain/ports";
import { marketTypeCreatedEvent } from "@/application/audit/writer";

export interface CreateMarketTypeInput {
  readonly actorId: string;
  readonly code: string;
  readonly name: string;
  readonly outcomeCardinality: OutcomeCardinality;
}

export interface CreateMarketTypeDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly marketTypes: (tx: Tx) => MarketTypeRepository;
  readonly ids: IdGenerator;
  readonly audit: AuditWriter<Tx>;
}

/**
 * Admin-only market-type registration (T-404, T-405). Rejects any non-binary
 * type up front — the fixed 1.8x/20% economic model can only represent
 * two-outcome markets, so there is no point persisting a type it can never back.
 */
export class CreateMarketTypeUseCase<Tx> {
  constructor(private readonly deps: CreateMarketTypeDeps<Tx>) {}

  async execute(input: CreateMarketTypeInput): Promise<PersistedMarketType> {
    if (input.code.trim().length === 0) {
      throw new DomainError("VALIDATION_FAILED", "code must not be empty", {
        details: { field: "code" },
      });
    }
    if (input.name.trim().length === 0) {
      throw new DomainError("VALIDATION_FAILED", "name must not be empty", {
        details: { field: "name" },
      });
    }

    assertSupportedByEconomicModel({
      code: input.code,
      name: input.name,
      outcomeCardinality: input.outcomeCardinality,
    });

    return this.deps.uow.run(async (tx) => {
      const marketTypes = this.deps.marketTypes(tx);

      const existing = await marketTypes.findByCode(input.code);
      if (existing) {
        throw new DomainError("VALIDATION_FAILED", "code already in use", {
          details: { field: "code", reason: "CODE_ALREADY_REGISTERED" },
        });
      }

      const marketType = await marketTypes.create(this.deps.ids.next(), {
        code: input.code,
        name: input.name,
        outcomeCardinality: input.outcomeCardinality,
      });

      await this.deps.audit.record(tx, marketTypeCreatedEvent(input.actorId, marketType.id));

      return marketType;
    });
  }
}
