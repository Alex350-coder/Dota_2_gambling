import { DomainError } from "@/domain/errors";
import { assertTransitionMarketResult } from "@/domain/settlement";
import type {
  AuditWriter,
  BetOrderRepository,
  Clock,
  MarketResult,
  MarketResultRepository,
  UnitOfWork,
} from "@/domain/ports";
import { resultConfirmedEvent } from "@/application/audit/writer";
import { assertActorHasNotInteractedWithMarket } from "./guards";

export interface ConfirmResultInput {
  readonly actorId: string;
  readonly resultId: string;
}

export interface ConfirmResultDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly marketResults: (tx: Tx) => MarketResultRepository;
  readonly betOrders: (tx: Tx, ownerId: string) => BetOrderRepository;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

/**
 * Second step of the 4-eyes result lifecycle (`RESULT_PROVIDERS.md` §4/§5): a *different*
 * admin than the proposer confirms the outcome, which is what actually authorises settlement
 * (`canConfirmResult` in `domain/settlement/state.ts` enforces proposer != confirmer and "at
 * most one CONFIRMED result per market" in-memory; the partial unique index on
 * `market_results (market_id) WHERE status = 'CONFIRMED'` is the hard, database-level backstop
 * for the same invariant under concurrency).
 */
export class ConfirmResultUseCase<Tx> {
  constructor(private readonly deps: ConfirmResultDeps<Tx>) {}

  async execute(input: ConfirmResultInput): Promise<MarketResult> {
    return this.deps.uow.run(async (tx) => {
      const marketResults = this.deps.marketResults(tx);
      const current = await marketResults.findById(input.resultId);
      if (!current) {
        throw new DomainError("RESOURCE_NOT_FOUND", "market result not found", {
          details: { resultId: input.resultId },
        });
      }

      await assertActorHasNotInteractedWithMarket(tx, this.deps, input.actorId, current.marketId);

      if (!current.proposedBy) {
        throw new DomainError("INTERNAL_ERROR", "market result has no recorded proposer", {
          details: { resultId: current.id },
        });
      }

      // Checked ahead of `assertTransitionMarketResult` so a same-actor confirmation attempt
      // reports the specific `UNAUTHORIZED_OPERATION` `RESULT_PROVIDERS.md` §8 requires, rather
      // than the generic `INVALID_STATE_TRANSITION` the guard would otherwise fold it into.
      if (input.actorId === current.proposedBy) {
        throw new DomainError(
          "UNAUTHORIZED_OPERATION",
          "the proposer cannot also confirm their own result (4-eyes rule)",
          { details: { resultId: current.id, actorId: input.actorId } },
        );
      }

      const existingConfirmed = await marketResults.findConfirmedByMarketId(current.marketId);

      assertTransitionMarketResult(current.status, "CONFIRMED", {
        proposerId: current.proposedBy,
        confirmerId: input.actorId,
        hasExistingConfirmedResult: existingConfirmed !== null,
      });

      const confirmedAt = this.deps.clock.now();
      const updated = await marketResults.updateStatus(current.id, "CONFIRMED", {
        confirmedBy: input.actorId,
        confirmedAt,
      });

      await this.deps.audit.record(tx, resultConfirmedEvent(input.actorId, updated.id));

      return updated;
    });
  }
}
