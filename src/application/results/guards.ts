import { DomainError } from "@/domain/errors";
import type { BetOrderRepository, Clock, IdGenerator, RiskAlertRepository } from "@/domain/ports";

export interface InteractedActorGuardDeps<Tx> {
  /** Owner-scoped, same shape every betting use case already builds this from. */
  readonly betOrders: (tx: Tx, ownerId: string) => BetOrderRepository;
  readonly riskAlerts: (tx: Tx) => RiskAlertRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/**
 * R-10 (`FRAUD_PREVENTION.md` §3, `RESULT_PROVIDERS.md` §7): an account that placed any order
 * — win, lose, matched or not — on a market cannot propose or confirm that market's result.
 * Wired into both `propose.ts` and `confirm.ts` (T-605). "Interacted" means the account owns at
 * least one `bet_orders` row on the market, in any status; there is no time-boxing or
 * matched-only carve-out — R-10 is a hard block, not a heuristic.
 *
 * T-915 adds the Critical `risk_alerts` row alongside the existing hard block (unlike
 * R-03..R-09, this write happens synchronously, in the same transaction, before the throw — the
 * block itself is the whole point here, there is no "fire-and-forget" concern since the request
 * is being rejected anyway).
 */
export async function assertActorHasNotInteractedWithMarket<Tx>(
  tx: Tx,
  deps: InteractedActorGuardDeps<Tx>,
  actorId: string,
  marketId: string,
): Promise<void> {
  const orders = await deps.betOrders(tx, actorId).listByOwner({ marketId });
  if (orders.length > 0) {
    await deps.riskAlerts(tx).create({
      id: deps.ids.next(),
      ruleId: "R-10",
      severity: "CRITICAL",
      entityType: "market",
      entityId: marketId,
      payload: { actorId, orderCount: orders.length },
      createdAt: deps.clock.now(),
    });
    throw new DomainError(
      "UNAUTHORIZED_OPERATION",
      "an account that placed an order on this market cannot propose or confirm its result (R-10)",
      { details: { actorId, marketId } },
    );
  }
}
