import { describe, expect, it } from "vitest";
import { toMinor } from "../money/types";
import { assertMarketAcceptingOrders, assertTransition, canTransition } from "./market-state";

const NOW = new Date("2026-01-10T00:00:00.000Z");
const FUTURE = new Date("2026-02-01T00:00:00.000Z");
const PAST = new Date("2026-01-01T00:00:00.000Z");

describe("canTransition (Market)", () => {
  it("allows DRAFT -> OPEN by ADMIN with >=2 outcomes, profile set, closesAt in the future", () => {
    const ctx = {
      actor: "ADMIN" as const,
      now: NOW,
      closesAt: FUTURE,
      outcomeCount: 2,
      economicProfileSet: true,
    };
    expect(canTransition("DRAFT", "OPEN", ctx)).toBe(true);
  });

  it("rejects DRAFT -> OPEN with fewer than 2 outcomes", () => {
    const ctx = {
      actor: "ADMIN" as const,
      now: NOW,
      closesAt: FUTURE,
      outcomeCount: 1,
      economicProfileSet: true,
    };
    expect(canTransition("DRAFT", "OPEN", ctx)).toBe(false);
  });

  it("rejects DRAFT -> OPEN when closesAt is not in the future", () => {
    const ctx = {
      actor: "ADMIN" as const,
      now: NOW,
      closesAt: PAST,
      outcomeCount: 2,
      economicProfileSet: true,
    };
    expect(canTransition("DRAFT", "OPEN", ctx)).toBe(false);
  });

  it("allows DRAFT -> CANCELLED by ADMIN when no orders exist", () => {
    expect(canTransition("DRAFT", "CANCELLED", { actor: "ADMIN", hasOrders: false })).toBe(true);
  });

  it("rejects DRAFT -> CANCELLED when orders exist", () => {
    expect(canTransition("DRAFT", "CANCELLED", { actor: "ADMIN", hasOrders: true })).toBe(false);
  });

  it("allows OPEN -> SUSPENDED by ADMIN or SYSTEM", () => {
    expect(canTransition("OPEN", "SUSPENDED", { actor: "ADMIN" })).toBe(true);
    expect(canTransition("OPEN", "SUSPENDED", { actor: "SYSTEM" })).toBe(true);
  });

  it("allows OPEN -> CLOSED when now >= closesAt", () => {
    const ctx = { actor: "SYSTEM" as const, now: FUTURE, closesAt: FUTURE };
    expect(canTransition("OPEN", "CLOSED", ctx)).toBe(true);
  });

  it("allows OPEN -> CLOSED via manual close before closesAt", () => {
    const ctx = { actor: "ADMIN" as const, now: NOW, closesAt: FUTURE, manualClose: true };
    expect(canTransition("OPEN", "CLOSED", ctx)).toBe(true);
  });

  it("rejects OPEN -> CLOSED before closesAt without manual close", () => {
    const ctx = { actor: "ADMIN" as const, now: NOW, closesAt: FUTURE };
    expect(canTransition("OPEN", "CLOSED", ctx)).toBe(false);
  });

  it("allows SUSPENDED -> OPEN by ADMIN when not past closesAt", () => {
    const ctx = { actor: "ADMIN" as const, now: NOW, closesAt: FUTURE };
    expect(canTransition("SUSPENDED", "OPEN", ctx)).toBe(true);
  });

  it("rejects SUSPENDED -> OPEN once past closesAt", () => {
    const ctx = { actor: "ADMIN" as const, now: FUTURE, closesAt: PAST };
    expect(canTransition("SUSPENDED", "OPEN", ctx)).toBe(false);
  });

  it("allows SUSPENDED -> CLOSED by ADMIN or SYSTEM", () => {
    expect(canTransition("SUSPENDED", "CLOSED", { actor: "ADMIN" })).toBe(true);
    expect(canTransition("SUSPENDED", "CLOSED", { actor: "SYSTEM" })).toBe(true);
  });

  it("allows SUSPENDED -> VOID by ADMIN when the match was not played", () => {
    expect(canTransition("SUSPENDED", "VOID", { actor: "ADMIN", matchPlayed: false })).toBe(true);
  });

  it("rejects SUSPENDED -> VOID when the match was played", () => {
    expect(canTransition("SUSPENDED", "VOID", { actor: "ADMIN", matchPlayed: true })).toBe(false);
  });

  it("allows CLOSED -> SETTLING by SYSTEM when a confirmed result exists", () => {
    expect(canTransition("CLOSED", "SETTLING", { actor: "SYSTEM", hasConfirmedResult: true })).toBe(
      true,
    );
  });

  it("rejects CLOSED -> SETTLING without a confirmed result", () => {
    expect(
      canTransition("CLOSED", "SETTLING", { actor: "SYSTEM", hasConfirmedResult: false }),
    ).toBe(false);
  });

  it("allows CLOSED -> VOID by ADMIN when the match was not played", () => {
    expect(canTransition("CLOSED", "VOID", { actor: "ADMIN", matchPlayed: false })).toBe(true);
  });

  it("allows SETTLING -> SETTLED by SYSTEM when the run completed and escrow is zero", () => {
    const ctx = {
      actor: "SYSTEM" as const,
      settlementRunCompleted: true,
      marketEscrowMinor: toMinor(0n),
    };
    expect(canTransition("SETTLING", "SETTLED", ctx)).toBe(true);
  });

  it("rejects SETTLING -> SETTLED when escrow is not zero", () => {
    const ctx = {
      actor: "SYSTEM" as const,
      settlementRunCompleted: true,
      marketEscrowMinor: toMinor(500n),
    };
    expect(canTransition("SETTLING", "SETTLED", ctx)).toBe(false);
  });

  it("allows SETTLING -> CLOSED by SYSTEM when settlement failed or result disputed", () => {
    expect(canTransition("SETTLING", "CLOSED", { actor: "SYSTEM", settlementFailed: true })).toBe(
      true,
    );
    expect(canTransition("SETTLING", "CLOSED", { actor: "SYSTEM", resultDisputed: true })).toBe(
      true,
    );
  });

  it("rejects VOID -> SETTLED (explicitly invalid, VOID is terminal after refunds)", () => {
    expect(canTransition("VOID", "SETTLED", { actor: "SYSTEM" })).toBe(false);
  });

  it("rejects any transition out of a terminal state", () => {
    for (const terminal of ["SETTLED", "CANCELLED", "VOID"] as const) {
      expect(canTransition(terminal, "OPEN", { actor: "ADMIN" })).toBe(false);
    }
  });

  it("rejects an unlisted transition", () => {
    expect(canTransition("DRAFT", "SETTLED", { actor: "ADMIN" })).toBe(false);
  });
});

describe("assertTransition (Market)", () => {
  it("does not throw for a valid transition", () => {
    expect(() => {
      assertTransition("OPEN", "SUSPENDED", { actor: "ADMIN" });
    }).not.toThrow();
  });

  it("throws a DomainError with code INVALID_STATE_TRANSITION for an invalid transition", () => {
    expect(() => {
      assertTransition("VOID", "SETTLED", { actor: "SYSTEM" });
    }).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
  });
});

describe("assertMarketAcceptingOrders", () => {
  it("does not throw for an OPEN market strictly before closesAt", () => {
    expect(() => {
      assertMarketAcceptingOrders({ status: "OPEN", closesAt: FUTURE }, NOW);
    }).not.toThrow();
  });

  it("throws MARKET_CLOSED for an OPEN market at or past closesAt", () => {
    expect(() => {
      assertMarketAcceptingOrders({ status: "OPEN", closesAt: FUTURE }, FUTURE);
    }).toThrow(expect.objectContaining({ code: "MARKET_CLOSED" }));
  });

  it("throws MARKET_SUSPENDED for a suspended market", () => {
    expect(() => {
      assertMarketAcceptingOrders({ status: "SUSPENDED", closesAt: FUTURE }, NOW);
    }).toThrow(expect.objectContaining({ code: "MARKET_SUSPENDED" }));
  });

  it("throws MARKET_CLOSED for any non-OPEN, non-SUSPENDED status", () => {
    for (const status of ["DRAFT", "CLOSED", "SETTLING", "SETTLED", "CANCELLED", "VOID"] as const) {
      expect(() => {
        assertMarketAcceptingOrders({ status, closesAt: FUTURE }, NOW);
      }).toThrow(expect.objectContaining({ code: "MARKET_CLOSED" }));
    }
  });
});
