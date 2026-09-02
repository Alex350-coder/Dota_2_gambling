import { createHash } from "node:crypto";
import { DomainError } from "@/domain/errors";
import { assertTransitionMarketResult } from "@/domain/settlement";
import type {
  AuditWriter,
  BetOrderRepository,
  Clock,
  IdGenerator,
  MarketResult,
  MarketResultRepository,
  OutcomeRepository,
  UnitOfWork,
} from "@/domain/ports";
import { resultDisputedEvent, resultResolvedEvent } from "@/application/audit/writer";
import { assertActorHasNotInteractedWithMarket } from "./guards";

function hashPayload(rawPayload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex");
}

export interface DisputeResultInput {
  readonly actorId: string;
  readonly resultId: string;
}

export interface DisputeResultDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly marketResults: (tx: Tx) => MarketResultRepository;
  readonly audit: AuditWriter<Tx>;
}

/**
 * `PROPOSED`/`VOID_PROPOSED` -> `DISPUTED` (`RESULT_PROVIDERS.md` §5). While a result stays
 * `DISPUTED` it can never reach `CONFIRMED` (`assertTransitionMarketResult` has no rule for
 * that edge), so `findConfirmedByMarketId` keeps returning `null` and settlement's
 * `RESULT_NOT_CONFIRMED` precondition (T-606) keeps blocking — funds simply stay in escrow
 * rather than settlement having to notice a dispute and roll anything back.
 */
export class DisputeResultUseCase<Tx> {
  constructor(private readonly deps: DisputeResultDeps<Tx>) {}

  async execute(input: DisputeResultInput): Promise<MarketResult> {
    return this.deps.uow.run(async (tx) => {
      const marketResults = this.deps.marketResults(tx);
      const current = await marketResults.findById(input.resultId);
      if (!current) {
        throw new DomainError("RESOURCE_NOT_FOUND", "market result not found", {
          details: { resultId: input.resultId },
        });
      }
      if (!current.proposedBy) {
        throw new DomainError("INTERNAL_ERROR", "market result has no recorded proposer", {
          details: { resultId: current.id },
        });
      }

      assertTransitionMarketResult(current.status, "DISPUTED", {
        proposerId: current.proposedBy,
      });

      const updated = await marketResults.updateStatus(current.id, "DISPUTED");
      await this.deps.audit.record(tx, resultDisputedEvent(input.actorId, updated.id));
      return updated;
    });
  }
}

export interface ResolveDisputeInput {
  readonly actorId: string;
  readonly disputedResultId: string;
  readonly winningOutcomeId: string | null;
  readonly rawPayload: Record<string, unknown>;
}

export interface ResolveDisputeDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly outcomes: (tx: Tx) => OutcomeRepository;
  readonly marketResults: (tx: Tx) => MarketResultRepository;
  readonly betOrders: (tx: Tx, ownerId: string) => BetOrderRepository;
  readonly providerKey: string;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

/**
 * Resolving a dispute never edits the disputed row (RESULT_PROVIDERS.md §5: "History is never
 * rewritten") — it marks the disputed row `SUPERSEDED` and inserts a brand new row pointing
 * `supersedesId` back at it, re-entering the normal propose/confirm (4-eyes) lifecycle from
 * scratch, `R-10` guard included.
 */
export class ResolveDisputeUseCase<Tx> {
  constructor(private readonly deps: ResolveDisputeDeps<Tx>) {}

  async execute(input: ResolveDisputeInput): Promise<MarketResult> {
    return this.deps.uow.run(async (tx) => {
      const marketResults = this.deps.marketResults(tx);
      const disputed = await marketResults.findById(input.disputedResultId);
      if (!disputed) {
        throw new DomainError("RESOURCE_NOT_FOUND", "market result not found", {
          details: { resultId: input.disputedResultId },
        });
      }
      if (disputed.status !== "DISPUTED") {
        throw new DomainError(
          "INVALID_STATE_TRANSITION",
          "only a DISPUTED result can be resolved",
          { details: { resultId: disputed.id, status: disputed.status } },
        );
      }

      await assertActorHasNotInteractedWithMarket(tx, this.deps, input.actorId, disputed.marketId);

      if (input.winningOutcomeId !== null) {
        const outcomes = await this.deps.outcomes(tx).listByMarketId(disputed.marketId);
        if (!outcomes.some((outcome) => outcome.id === input.winningOutcomeId)) {
          throw new DomainError(
            "INVALID_OUTCOME",
            "winning outcome does not belong to this market",
            { details: { marketId: disputed.marketId, winningOutcomeId: input.winningOutcomeId } },
          );
        }
      }

      const to = input.winningOutcomeId === null ? "VOID_PROPOSED" : "PROPOSED";
      assertTransitionMarketResult("PENDING", to, { proposerId: input.actorId });
      assertTransitionMarketResult("DISPUTED", "SUPERSEDED", { proposerId: input.actorId });

      await marketResults.updateStatus(disputed.id, "SUPERSEDED");

      const resolved = await marketResults.create({
        id: this.deps.ids.next(),
        marketId: disputed.marketId,
        providerKey: this.deps.providerKey,
        trustLevel: disputed.trustLevel,
        winningOutcomeId: input.winningOutcomeId,
        rawPayload: input.rawPayload,
        payloadHash: hashPayload(input.rawPayload),
        status: to,
        proposedBy: input.actorId,
        supersedesId: disputed.id,
        createdAt: this.deps.clock.now(),
      });

      await this.deps.audit.record(
        tx,
        resultResolvedEvent(input.actorId, resolved.id, disputed.id),
      );
      return resolved;
    });
  }
}
