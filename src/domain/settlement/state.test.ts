import { describe, expect, it } from "vitest";
import { toMinor } from "../money/types";
import {
  assertTransitionMarketResult,
  assertTransitionMatchAllocation,
  assertTransitionSettlementRun,
  canTransitionMarketResult,
  canTransitionMatchAllocation,
  canTransitionSettlementRun,
} from "./state";

describe("canTransitionMatchAllocation", () => {
  it("allows ACTIVE -> SETTLED by SYSTEM", () => {
    expect(canTransitionMatchAllocation("ACTIVE", "SETTLED", { actor: "SYSTEM" })).toBe(true);
  });

  it("allows ACTIVE -> VOIDED by SYSTEM", () => {
    expect(canTransitionMatchAllocation("ACTIVE", "VOIDED", { actor: "SYSTEM" })).toBe(true);
  });

  it("rejects any transition out of a terminal state", () => {
    expect(canTransitionMatchAllocation("SETTLED", "VOIDED", { actor: "SYSTEM" })).toBe(false);
    expect(canTransitionMatchAllocation("VOIDED", "SETTLED", { actor: "SYSTEM" })).toBe(false);
  });
});

describe("canTransitionMarketResult", () => {
  it("allows PENDING -> PROPOSED", () => {
    expect(
      canTransitionMarketResult("PENDING", "PROPOSED", {
        proposerId: "u1",
        confirmerId: undefined,
      }),
    ).toBe(true);
  });

  it("allows PROPOSED -> CONFIRMED when confirmer differs from proposer (RULE-E13)", () => {
    const ctx = { proposerId: "u1", confirmerId: "u2", hasExistingConfirmedResult: false };
    expect(canTransitionMarketResult("PROPOSED", "CONFIRMED", ctx)).toBe(true);
  });

  it("rejects PROPOSED -> CONFIRMED when confirmer equals proposer", () => {
    const ctx = { proposerId: "u1", confirmerId: "u1", hasExistingConfirmedResult: false };
    expect(canTransitionMarketResult("PROPOSED", "CONFIRMED", ctx)).toBe(false);
  });

  it("rejects PROPOSED -> CONFIRMED when a CONFIRMED result already exists for the market", () => {
    const ctx = { proposerId: "u1", confirmerId: "u2", hasExistingConfirmedResult: true };
    expect(canTransitionMarketResult("PROPOSED", "CONFIRMED", ctx)).toBe(false);
  });

  it("allows PROPOSED -> DISPUTED", () => {
    expect(
      canTransitionMarketResult("PROPOSED", "DISPUTED", {
        proposerId: "u1",
        confirmerId: undefined,
      }),
    ).toBe(true);
  });

  it("allows CONFIRMED -> SUPERSEDED", () => {
    expect(
      canTransitionMarketResult("CONFIRMED", "SUPERSEDED", {
        proposerId: "u1",
        confirmerId: "u2",
      }),
    ).toBe(true);
  });

  it("rejects any transition out of a terminal state", () => {
    const ctx = { proposerId: "u1", confirmerId: "u2" };
    expect(canTransitionMarketResult("DISPUTED", "PROPOSED", ctx)).toBe(false);
    expect(canTransitionMarketResult("SUPERSEDED", "CONFIRMED", ctx)).toBe(false);
  });
});

describe("canTransitionSettlementRun", () => {
  it("allows IN_PROGRESS -> COMPLETED when escrow is zero and no run has completed yet", () => {
    const ctx = { marketEscrowMinor: toMinor(0n), hasExistingCompletedRun: false };
    expect(canTransitionSettlementRun("IN_PROGRESS", "COMPLETED", ctx)).toBe(true);
  });

  it("rejects IN_PROGRESS -> COMPLETED when escrow is not zero", () => {
    const ctx = { marketEscrowMinor: toMinor(500n), hasExistingCompletedRun: false };
    expect(canTransitionSettlementRun("IN_PROGRESS", "COMPLETED", ctx)).toBe(false);
  });

  it("rejects IN_PROGRESS -> COMPLETED when a run has already completed for the market", () => {
    const ctx = { marketEscrowMinor: toMinor(0n), hasExistingCompletedRun: true };
    expect(canTransitionSettlementRun("IN_PROGRESS", "COMPLETED", ctx)).toBe(false);
  });

  it("allows IN_PROGRESS -> FAILED", () => {
    expect(
      canTransitionSettlementRun("IN_PROGRESS", "FAILED", {
        marketEscrowMinor: toMinor(500n),
        hasExistingCompletedRun: false,
      }),
    ).toBe(true);
  });

  it("allows FAILED -> IN_PROGRESS (retry)", () => {
    expect(
      canTransitionSettlementRun("FAILED", "IN_PROGRESS", {
        marketEscrowMinor: toMinor(500n),
        hasExistingCompletedRun: false,
      }),
    ).toBe(true);
  });

  it("rejects any transition out of the terminal COMPLETED state", () => {
    expect(
      canTransitionSettlementRun("COMPLETED", "IN_PROGRESS", {
        marketEscrowMinor: toMinor(0n),
        hasExistingCompletedRun: true,
      }),
    ).toBe(false);
  });
});

describe("assertTransition* helpers", () => {
  it("throw a DomainError with code INVALID_STATE_TRANSITION for invalid transitions", () => {
    expect(() => {
      assertTransitionMatchAllocation("SETTLED", "VOIDED", { actor: "SYSTEM" });
    }).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));

    expect(() => {
      assertTransitionMarketResult("SUPERSEDED", "CONFIRMED", {
        proposerId: "u1",
        confirmerId: "u2",
      });
    }).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));

    expect(() => {
      assertTransitionSettlementRun("COMPLETED", "IN_PROGRESS", {
        marketEscrowMinor: toMinor(0n),
        hasExistingCompletedRun: true,
      });
    }).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
  });

  it("do not throw for valid transitions", () => {
    expect(() => {
      assertTransitionMatchAllocation("ACTIVE", "SETTLED", { actor: "SYSTEM" });
    }).not.toThrow();
  });
});
