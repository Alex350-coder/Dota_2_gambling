import { describe, expect, it } from "vitest";
import { toMinor } from "../money/types";
import { assertTransition, canTransition } from "./order-state";

describe("canTransition (BetOrder)", () => {
  it("allows PENDING -> OPEN by SYSTEM", () => {
    expect(canTransition("PENDING", "OPEN", { actor: "SYSTEM" })).toBe(true);
  });

  it("rejects PENDING -> OPEN by USER (wrong actor)", () => {
    expect(canTransition("PENDING", "OPEN", { actor: "USER" })).toBe(false);
  });

  it("allows PENDING -> REJECTED by SYSTEM", () => {
    expect(canTransition("PENDING", "REJECTED", { actor: "SYSTEM" })).toBe(true);
  });

  it("allows OPEN -> OPEN (partial fill) when matched>0 and unmatched>0", () => {
    const ctx = {
      actor: "SYSTEM" as const,
      matchedMinor: toMinor(3_000n),
      unmatchedMinor: toMinor(7_000n),
    };
    expect(canTransition("OPEN", "OPEN", ctx)).toBe(true);
  });

  it("rejects OPEN -> OPEN when unmatched is already zero", () => {
    const ctx = {
      actor: "SYSTEM" as const,
      matchedMinor: toMinor(10_000n),
      unmatchedMinor: toMinor(0n),
    };
    expect(canTransition("OPEN", "OPEN", ctx)).toBe(false);
  });

  it("allows OPEN -> MATCHED when unmatched == 0", () => {
    const ctx = {
      actor: "SYSTEM" as const,
      matchedMinor: toMinor(10_000n),
      unmatchedMinor: toMinor(0n),
    };
    expect(canTransition("OPEN", "MATCHED", ctx)).toBe(true);
  });

  it("rejects OPEN -> MATCHED when unmatched > 0", () => {
    const ctx = {
      actor: "SYSTEM" as const,
      matchedMinor: toMinor(3_000n),
      unmatchedMinor: toMinor(7_000n),
    };
    expect(canTransition("OPEN", "MATCHED", ctx)).toBe(false);
  });

  it("allows OPEN -> CANCELLED by USER when market is OPEN", () => {
    expect(canTransition("OPEN", "CANCELLED", { actor: "USER", marketStatus: "OPEN" })).toBe(true);
  });

  it("allows OPEN -> CANCELLED by SYSTEM when market is SUSPENDED", () => {
    expect(canTransition("OPEN", "CANCELLED", { actor: "SYSTEM", marketStatus: "SUSPENDED" })).toBe(
      true,
    );
  });

  it("rejects OPEN -> CANCELLED when market is CLOSED", () => {
    expect(canTransition("OPEN", "CANCELLED", { actor: "USER", marketStatus: "CLOSED" })).toBe(
      false,
    );
  });

  it("allows MATCHED -> SETTLED by SYSTEM", () => {
    expect(canTransition("MATCHED", "SETTLED", { actor: "SYSTEM" })).toBe(true);
  });

  it("allows OPEN -> SETTLED by SYSTEM", () => {
    expect(canTransition("OPEN", "SETTLED", { actor: "SYSTEM" })).toBe(true);
  });

  it("allows MATCHED -> VOIDED and OPEN -> VOIDED by SYSTEM", () => {
    expect(canTransition("MATCHED", "VOIDED", { actor: "SYSTEM" })).toBe(true);
    expect(canTransition("OPEN", "VOIDED", { actor: "SYSTEM" })).toBe(true);
  });

  it("rejects any transition out of a terminal state", () => {
    for (const terminal of ["SETTLED", "VOIDED", "CANCELLED", "REJECTED"] as const) {
      expect(canTransition(terminal, "OPEN", { actor: "SYSTEM" })).toBe(false);
    }
  });

  it("rejects an unlisted transition", () => {
    expect(canTransition("PENDING", "MATCHED", { actor: "SYSTEM" })).toBe(false);
  });
});

describe("assertTransition (BetOrder)", () => {
  it("does not throw for a valid transition", () => {
    expect(() => {
      assertTransition("PENDING", "OPEN", { actor: "SYSTEM" });
    }).not.toThrow();
  });

  it("throws a DomainError with code INVALID_STATE_TRANSITION for an invalid transition", () => {
    expect(() => {
      assertTransition("SETTLED", "OPEN", { actor: "SYSTEM" });
    }).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
  });
});
