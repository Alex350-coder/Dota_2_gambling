import type { SettlementRun } from "@/domain/ports";

/** Bigint minor-unit fields are always serialized via `.toString()` in JSON responses. */
export function serializeSettlementRun(run: SettlementRun) {
  return {
    id: run.id,
    marketId: run.marketId,
    resultId: run.resultId,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    allocationsTotal: run.allocationsTotal,
    allocationsSettled: run.allocationsSettled,
    payoutTotalMinor: run.payoutTotalMinor.toString(),
    commissionTotalMinor: run.commissionTotalMinor.toString(),
    refundTotalMinor: run.refundTotalMinor.toString(),
    retryCount: run.retryCount,
    nextRetryAt: run.nextRetryAt,
  };
}
