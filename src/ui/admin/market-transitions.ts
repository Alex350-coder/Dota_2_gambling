/**
 * Structural (guard-free) admin-reachable next states per current `MarketStatus`
 * (`src/domain/catalog/market-state.ts` TRANSITION_RULES, ADMIN-actor edges only — the
 * SYSTEM-only CLOSED->SETTLING/SETTLING->* edges are driven by the dedicated Settle action, not
 * this generic transition picker). This is a UI convenience list only: the server's
 * `assertTransition` (called by `POST /admin/markets/{id}/transition`) remains the sole
 * authority — a status-timing or order-count guard can still reject an offered action, and the
 * route always re-validates (T-904's actual safety guarantee, already fully tested by
 * transition-market.test.ts and the admin-catalog-routes.test.ts negative suite).
 */
const ADMIN_NEXT_STATES: Readonly<Record<string, readonly string[]>> = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["SUSPENDED", "CLOSED"],
  SUSPENDED: ["OPEN", "CLOSED", "VOID"],
  CLOSED: ["VOID"],
  SETTLING: [],
  SETTLED: [],
  CANCELLED: [],
  VOID: [],
};

export function adminReachableMarketStates(status: string): readonly string[] {
  return ADMIN_NEXT_STATES[status] ?? [];
}
