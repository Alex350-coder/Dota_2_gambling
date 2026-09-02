import { DomainError } from "@/domain/errors";
import { assertTransition } from "@/domain/catalog";
import { assertTransitionSettlementRun } from "@/domain/settlement";
import { ZERO_MINOR } from "@/domain/money";
import type {
  AuditWriter,
  Clock,
  IdGenerator,
  MarketRepository,
  MarketResultRepository,
  SettlementRun,
  SettlementRunRepository,
  UnitOfWork,
} from "@/domain/ports";
import { marketStatusChangedEvent } from "@/application/audit/writer";

export interface SettleMarketInput {
  readonly actorId: string;
  readonly marketId: string;
}

export interface SettleMarketDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly markets: (tx: Tx) => MarketRepository;
  readonly marketResults: (tx: Tx) => MarketResultRepository;
  readonly settlementRuns: (tx: Tx) => SettlementRunRepository;
  readonly acquireMarketLock: (tx: Tx, marketId: string) => Promise<void>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

/**
 * Resume-capable settlement shell (`SETTLEMENT.md` §2-3, T-606). Establishes every precondition
 * and the run row's state machine only — Phase 1/2/3 (release, per-allocation payout, hard
 * escrow-zero finalisation) land in later commits and slot in between `upsertInProgress` and
 * `markCompleted` without changing this shape. A market's `market_results` `CONFIRMED` row and
 * `settlement_runs`' own `one_completed_run_per_market` partial unique index are what make a
 * double settlement structurally impossible, not application-level locking alone — the advisory
 * lock only serializes concurrent attempts so they see each other's writes.
 */
export class SettleMarketUseCase<Tx> {
  constructor(private readonly deps: SettleMarketDeps<Tx>) {}

  async execute(input: SettleMarketInput): Promise<SettlementRun> {
    return this.deps.uow.run(async (tx) => {
      await this.deps.acquireMarketLock(tx, input.marketId);

      const markets = this.deps.markets(tx);
      const market = await markets.findById(input.marketId);
      if (!market) {
        throw new DomainError("RESOURCE_NOT_FOUND", "market not found", {
          details: { marketId: input.marketId },
        });
      }
      if (market.status !== "CLOSED" && market.status !== "SETTLING") {
        throw new DomainError(
          "MARKET_NOT_SETTLEABLE",
          "settlement requires the market to be CLOSED or already SETTLING (resume)",
          { details: { marketId: market.id, status: market.status } },
        );
      }

      const confirmedResult = await this.deps.marketResults(tx).findConfirmedByMarketId(market.id);
      if (!confirmedResult) {
        throw new DomainError(
          "RESULT_NOT_CONFIRMED",
          "settlement requires a CONFIRMED market result",
          { details: { marketId: market.id } },
        );
      }

      const settlementRuns = this.deps.settlementRuns(tx);
      const existingRun = await settlementRuns.findByMarketId(market.id);
      this.assertResumable(market.id, existingRun);

      const run = await settlementRuns.upsertInProgress({
        id: existingRun?.id ?? this.deps.ids.next(),
        marketId: market.id,
        resultId: confirmedResult.id,
        startedAt: this.deps.clock.now(),
      });

      if (market.status === "CLOSED") {
        assertTransition("CLOSED", "SETTLING", { actor: "SYSTEM", hasConfirmedResult: true });
        await markets.updateStatus(market.id, "SETTLING");
        await this.deps.audit.record(tx, marketStatusChangedEvent(input.actorId, market.id));
      }

      return run;
    });
  }

  /**
   * `SETTLEMENT.md` §2's "no ... run ... currently IN_PROGRESS" and "not already `COMPLETED`"
   * preconditions, plus the state-machine check for resuming a `FAILED` run. The doc documents
   * only `MARKET_NOT_SETTLEABLE`, `RESULT_NOT_CONFIRMED` and `ALREADY_SETTLED` as
   * settle-precondition failure codes, so both the completed and in-progress cases map to
   * `ALREADY_SETTLED`.
   */
  private assertResumable(marketId: string, existingRun: SettlementRun | null): void {
    if (existingRun?.status === "COMPLETED") {
      throw new DomainError("ALREADY_SETTLED", "this market has already been settled", {
        details: { marketId, runId: existingRun.id },
      });
    }
    // Unreachable while every phase commits in one transaction (this skeleton): a crash
    // mid-run rolls the whole attempt back, so no IN_PROGRESS row survives to be observed
    // here. Once T-611 batches large markets across multiple transactions, a genuinely orphaned
    // IN_PROGRESS row becomes possible (crash between batches) — this is the guard for that case.
    if (existingRun?.status === "IN_PROGRESS") {
      throw new DomainError(
        "ALREADY_SETTLED",
        "a settlement run for this market is already in progress",
        { details: { marketId, runId: existingRun.id } },
      );
    }
    if (existingRun?.status === "FAILED") {
      // FAILED -> IN_PROGRESS is an unconditional guard (only COMPLETED's guard reads
      // marketEscrowMinor/hasExistingCompletedRun) — these are unused placeholders required by
      // the shared context shape, not meaningful inputs to this particular transition.
      assertTransitionSettlementRun("FAILED", "IN_PROGRESS", {
        marketEscrowMinor: ZERO_MINOR,
        hasExistingCompletedRun: false,
      });
    }
  }
}
