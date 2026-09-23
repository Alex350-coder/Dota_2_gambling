import type { Container } from "./container";
import { evaluatePlacementRiskRules, evaluateCloseWindowDispute } from "@/application/risk";

/**
 * Fire-and-forget risk-rule triggers (T-913/T-914) — called with `void` from the route, never
 * awaited on the request path, so a rule evaluation can never delay or block the response
 * (FRAUD_PREVENTION.md §3). Each opens its own transaction (the triggering request's own
 * transaction has already committed by the time this runs) and swallows any error into a log
 * line rather than letting an unhandled rejection surface — a failed risk check must never look
 * like a failed bet/dispute to the caller, who has already received their 2xx response.
 */
export function triggerPlacementRiskRules(container: Container, orderId: string): void {
  void container.uow
    .run((tx) =>
      evaluatePlacementRiskRules(
        tx,
        {
          riskSignals: container.riskSignals,
          riskAlerts: container.riskAlerts,
          ids: container.ids,
          clock: container.clock,
        },
        orderId,
      ),
    )
    .catch((error: unknown) => {
      container.logger.error("risk rule evaluation failed", {
        orderId,
        outcome: error instanceof Error ? error.message : "unknown error",
      });
    });
}

export function triggerCloseWindowDisputeRule(container: Container, marketId: string): void {
  void container.uow
    .run((tx) =>
      evaluateCloseWindowDispute(
        tx,
        {
          riskSignals: container.riskSignals,
          riskAlerts: container.riskAlerts,
          ids: container.ids,
          clock: container.clock,
        },
        marketId,
      ),
    )
    .catch((error: unknown) => {
      container.logger.error("risk rule evaluation failed", {
        marketId,
        outcome: error instanceof Error ? error.message : "unknown error",
      });
    });
}
