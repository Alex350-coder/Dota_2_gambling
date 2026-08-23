import { DomainError } from "@/domain/errors";
import { assertSupportedByEconomicModel } from "@/domain/catalog";
import type {
  AuditWriter,
  EconomicProfileRepository,
  IdGenerator,
  Market,
  MarketRepository,
  MarketTypeRepository,
  MatchRepository,
  OutcomeRepository,
  StreamerRepository,
  UnitOfWork,
} from "@/domain/ports";
import { marketCreatedEvent } from "@/application/audit/writer";

interface CreateMarketOutcomeInput {
  readonly code: string;
  readonly label: string;
}

export interface CreateMarketInput {
  readonly actorId: string;
  readonly matchId: string;
  readonly marketTypeId: string;
  readonly streamerId: string;
  readonly economicProfileId: string;
  readonly closesAt: Date;
  readonly outcomes: readonly CreateMarketOutcomeInput[];
}

export interface CreateMarketDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly matches: (tx: Tx) => MatchRepository;
  readonly marketTypes: (tx: Tx) => MarketTypeRepository;
  readonly streamers: (tx: Tx) => StreamerRepository;
  readonly economicProfiles: (tx: Tx) => EconomicProfileRepository;
  readonly markets: (tx: Tx) => MarketRepository;
  readonly outcomes: (tx: Tx) => OutcomeRepository;
  readonly ids: IdGenerator;
  readonly audit: AuditWriter<Tx>;
}

/**
 * Admin-only market creation (T-406). Persists the `Market` (starting in
 * `DRAFT`, per `market-state.ts`) and all of its `Outcome`s atomically in one
 * transaction — a market is never observable with zero or one outcome.
 */
export class CreateMarketUseCase<Tx> {
  constructor(private readonly deps: CreateMarketDeps<Tx>) {}

  async execute(input: CreateMarketInput): Promise<Market> {
    if (input.outcomes.length < 2) {
      throw new DomainError("VALIDATION_FAILED", "a market needs at least two outcomes", {
        details: { field: "outcomes", reason: "TOO_FEW_OUTCOMES" },
      });
    }
    const codes = input.outcomes.map((outcome) => outcome.code);
    if (new Set(codes).size !== codes.length) {
      throw new DomainError("VALIDATION_FAILED", "outcome codes must be unique within a market", {
        details: { field: "outcomes", reason: "DUPLICATE_OUTCOME_CODE" },
      });
    }

    return this.deps.uow.run(async (tx) => {
      const match = await this.deps.matches(tx).findById(input.matchId);
      if (!match) {
        throw new DomainError("RESOURCE_NOT_FOUND", "match not found", {
          details: { matchId: input.matchId },
        });
      }

      const marketType = await this.deps.marketTypes(tx).findById(input.marketTypeId);
      if (!marketType) {
        throw new DomainError("RESOURCE_NOT_FOUND", "market type not found", {
          details: { marketTypeId: input.marketTypeId },
        });
      }
      assertSupportedByEconomicModel(marketType);

      const streamer = await this.deps.streamers(tx).findById(input.streamerId);
      if (!streamer) {
        throw new DomainError("RESOURCE_NOT_FOUND", "streamer not found", {
          details: { streamerId: input.streamerId },
        });
      }

      const economicProfile = await this.deps
        .economicProfiles(tx)
        .findById(input.economicProfileId);
      if (!economicProfile) {
        throw new DomainError("RESOURCE_NOT_FOUND", "economic profile not found", {
          details: { economicProfileId: input.economicProfileId },
        });
      }

      const market = await this.deps.markets(tx).create({
        id: this.deps.ids.next(),
        matchId: input.matchId,
        marketTypeId: input.marketTypeId,
        streamerId: input.streamerId,
        economicProfileId: input.economicProfileId,
        closesAt: input.closesAt,
      });

      const outcomes = this.deps.outcomes(tx);
      for (const outcome of input.outcomes) {
        await outcomes.create({
          id: this.deps.ids.next(),
          marketId: market.id,
          code: outcome.code,
          label: outcome.label,
        });
      }

      await this.deps.audit.record(tx, marketCreatedEvent(input.actorId, market.id));

      return market;
    });
  }
}
