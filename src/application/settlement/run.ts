import { DomainError } from "@/domain/errors";
import { assertTransition } from "@/domain/catalog";
import { assertTransitionSettlementRun } from "@/domain/settlement";
import { ZERO_MINOR } from "@/domain/money";
import type {
  AllocationRepository,
  AuditWriter,
  BetOrderRepository,
  BookRepository,
  Clock,
  EconomicProfileRepository,
  IdGenerator,
  LedgerWriter,
  MarketRepository,
  MarketResultRepository,
  SettlementRun,
  SettlementRunRepository,
  UnitOfWork,
} from "@/domain/ports";
import { marketStatusChangedEvent } from "@/application/audit/writer";
import { finalizeSettlement } from "./finalize";
import { releaseUnmatchedForSettlement } from "./release";
import { settleAllocationsOnConfirmedResult } from "./settle-allocation";

export interface SettleMarketInput {
  /** `null` for scheduler-driven resumes (T-612's sweeper), same convention as `TransitionMarketUseCase`. */
  readonly actorId: string | null;
  readonly marketId: string;
}

export interface SettleMarketDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly markets: (tx: Tx) => MarketRepository;
  readonly marketResults: (tx: Tx) => MarketResultRepository;
  readonly settlementRuns: (tx: Tx) => SettlementRunRepository;
  readonly allocations: (tx: Tx) => AllocationRepository;
  readonly book: (tx: Tx) => BookRepository;
  readonly betOrders: (tx: Tx, ownerId: string) => BetOrderRepository;
  readonly economicProfiles: (tx: Tx) => EconomicProfileRepository;
  readonly ledger: LedgerWriter<Tx>;
  readonly acquireMarketLock: (tx: Tx, marketId: string) => Promise<void>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

/**
 * Resume-capable settlement orchestrator (`SETTLEMENT.md` §2-4, T-606/T-607/T-608). Establishes
 * every precondition and the run row's state machine (T-606), then runs Phase 1 (release
 * unmatched, defensive re-invocation of the already-idempotent T-511 logic) and Phase 2
 * (per-allocation payout + commission, `settle:<allocationId>` keys). Phase 3 (hard
 * escrow-zero assertion, finalisation to `COMPLETED`/`SETTLED`) lands in a later commit — until
 * then a call always leaves the run `IN_PROGRESS` even once every allocation is settled. A
 * market's `market_results` `CONFIRMED` row and `settlement_runs`' own
 * `one_completed_run_per_market` partial unique index are what make a double settlement
 * structurally impossible, not application-level locking alone — the advisory lock only
 * serializes concurrent attempts so they see each other's writes.
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
      // Checked ahead of the general CLOSED/SETTLING guard below: a SETTLED market is a more
      // specific, more useful failure (`ALREADY_SETTLED`) than the generic
      // `MARKET_NOT_SETTLEABLE` that status would otherwise fall into, and matches
      // `SETTLEMENT.md` §2's documented precondition-failure codes.
      if (market.status === "SETTLED") {
        throw new DomainError("ALREADY_SETTLED", "this market has already been settled", {
          details: { marketId: market.id },
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

      await releaseUnmatchedForSettlement(tx, this.deps, market);

      // A CONFIRMED result with winningOutcomeId === null is a void confirmation
      // (SETTLEMENT.md §6) — a distinct refund path (T-610), not this phase's per-allocation
      // payout math. Skip Phase 2 for it; the run stays IN_PROGRESS until the void path lands.
      if (confirmedResult.winningOutcomeId !== null) {
        const phase2 = await settleAllocationsOnConfirmedResult(
          tx,
          this.deps,
          market,
          confirmedResult.winningOutcomeId,
        );
        const counts = await this.deps.allocations(tx).countByStatus(market.id);
        const updatedRun = await settlementRuns.updateProgress(run.id, {
          allocationsTotal: counts.active + counts.settled + counts.voided,
          allocationsSettled: counts.settled,
        });

        // No cross-transaction batching yet (T-611 carve-out — see finalize.ts): every
        // allocation settles in this same call, so `counts.active === 0` always holds here.
        // Phase 3 finalises immediately rather than leaving the run IN_PROGRESS.
        return await finalizeSettlement(tx, this.deps, market, updatedRun, {
          payoutTotalMinor: phase2.payoutTotalMinor,
          commissionTotalMinor: phase2.commissionTotalMinor,
          refundTotalMinor: 0n,
        });
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
