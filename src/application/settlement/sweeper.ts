import type { AuditWriter, Clock, SettlementRunRepository, UnitOfWork } from "@/domain/ports";
import { settlementRunAlertEvent } from "@/application/audit/writer";
import type { SettleMarketUseCase } from "./run";

export interface SettlementSweeperDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly settlementRuns: (tx: Tx) => SettlementRunRepository;
  readonly settleMarket: SettleMarketUseCase<Tx>;
  readonly clock: Clock;
  readonly audit: AuditWriter<Tx>;
}

export interface SettlementSweepResult {
  readonly attempted: number;
  readonly recovered: number;
  readonly stillFailing: number;
  readonly alerted: number;
}

const BASE_BACKOFF_MS = 60_000; // 1 minute
const MAX_BACKOFF_MS = 60 * 60_000; // 1 hour
const ALERT_THRESHOLD = 3;

function backoffFor(retryCount: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** retryCount, MAX_BACKOFF_MS);
}

/**
 * T-612: retries `FAILED` settlement runs. `SettleMarketUseCase.execute()` already knows how to
 * resume a `FAILED` run (`assertResumable`'s `FAILED -> IN_PROGRESS` branch, T-606) — this
 * sweeper's only job is to find candidates due for a retry and call it, never to reimplement
 * resume logic of its own. Reuses the `settle:<allocationId>` idempotency keys already proven in
 * commits 6/7: a retried run can never double-pay an allocation whose ledger transaction already
 * posted, so a repeated sweep attempt is exactly as safe as the very first one.
 *
 * Each candidate run is attempted in its own transaction (via `settleMarket.execute()`, which
 * opens one itself) so one market's failure can never block another's retry in the same sweep.
 * A failed attempt bumps `retry_count`/`next_retry_at` with exponential backoff (base 1 minute,
 * capped at 1 hour) so repeated crashes don't hot-loop the sweeper against a market that isn't
 * going to recover on its own. `ops/OBSERVABILITY.md` alert wiring doesn't exist yet (P9 T-912),
 * so crossing 3 total failures writes a `SETTLEMENT_RUN_ALERT` audit event as the interim
 * mechanism instead, explicitly noted as such.
 */
export async function sweepFailedSettlementRuns<Tx>(
  deps: SettlementSweeperDeps<Tx>,
): Promise<SettlementSweepResult> {
  const now = deps.clock.now();
  const runs = await deps.uow.run((tx) => deps.settlementRuns(tx).listRetryable(now));

  let recovered = 0;
  let stillFailing = 0;
  let alerted = 0;

  for (const run of runs) {
    try {
      await deps.settleMarket.execute({ actorId: null, marketId: run.marketId });
      recovered += 1;
    } catch {
      stillFailing += 1;
      const retryCount = run.retryCount + 1;
      const nextRetryAt = new Date(now.getTime() + backoffFor(retryCount));
      await deps.uow.run((tx) =>
        deps.settlementRuns(tx).recordRetryAttempt(run.id, { retryCount, nextRetryAt }),
      );
      if (retryCount >= ALERT_THRESHOLD) {
        alerted += 1;
        await deps.uow.run((tx) =>
          deps.audit.record(tx, settlementRunAlertEvent(run.marketId, run.id, retryCount)),
        );
      }
    }
  }

  return { attempted: runs.length, recovered, stillFailing, alerted };
}
