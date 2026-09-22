import { describe, expect, it } from "vitest";
import { canTransition, type MarketStatus } from "@/domain/catalog";
import { adminReachableMarketStates } from "./market-transitions";

/**
 * Every state this UI table offers for an ADMIN actor must be reachable per the domain guard
 * under *some* admin-favorable context (outcomes set, before closesAt, no orders yet, match not
 * played) — this doesn't prove every offered action always succeeds (guards can still reject on
 * live data), only that the table never offers a structurally impossible ADMIN edge.
 */
describe("adminReachableMarketStates", () => {
  const FAVORABLE_CONTEXT = {
    actor: "ADMIN" as const,
    now: new Date("2026-01-01T00:00:00Z"),
    closesAt: new Date("2026-06-01T00:00:00Z"),
    outcomeCount: 2,
    economicProfileSet: true,
    hasOrders: false,
    manualClose: true,
    matchPlayed: false,
  };

  const STATUSES: readonly MarketStatus[] = [
    "DRAFT",
    "OPEN",
    "SUSPENDED",
    "CLOSED",
    "SETTLING",
    "SETTLED",
    "CANCELLED",
    "VOID",
  ];

  it.each(STATUSES)(
    "every offered target from %s is reachable under a favorable context",
    (from) => {
      for (const to of adminReachableMarketStates(from)) {
        expect(canTransition(from, to as MarketStatus, FAVORABLE_CONTEXT)).toBe(true);
      }
    },
  );

  it("offers nothing for terminal states", () => {
    expect(adminReachableMarketStates("SETTLED")).toEqual([]);
    expect(adminReachableMarketStates("CANCELLED")).toEqual([]);
    expect(adminReachableMarketStates("VOID")).toEqual([]);
  });
});
