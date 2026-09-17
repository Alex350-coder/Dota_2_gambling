import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors";
import {
  applyLimitChange,
  assertValidLimitPeriod,
  effectiveLimitValue,
  LIMIT_RAISE_COOLING_OFF_MS,
  selfExclusionRevocableAt,
  type RgLimitState,
} from "./limits";

const NOW = new Date("2026-01-01T00:00:00.000Z");

function baseLimit(overrides: Partial<RgLimitState> = {}): RgLimitState {
  return {
    kind: "STAKE",
    period: "DAY",
    currentValue: 10_000n,
    pendingValue: null,
    effectiveAt: null,
    ...overrides,
  };
}

describe("assertValidLimitPeriod", () => {
  it("accepts DAY/WEEK/MONTH for amount-based kinds", () => {
    expect(() => {
      assertValidLimitPeriod("DEPOSIT", "WEEK");
    }).not.toThrow();
  });

  it("rejects a period not valid for the kind", () => {
    try {
      assertValidLimitPeriod("STAKE", "PER_BET");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("VALIDATION_FAILED");
    }
  });

  it("only accepts SESSION for SESSION_TIME", () => {
    expect(() => {
      assertValidLimitPeriod("SESSION_TIME", "SESSION");
    }).not.toThrow();
    expect(() => {
      assertValidLimitPeriod("SESSION_TIME", "DAY");
    }).toThrow(DomainError);
  });

  it("only accepts PER_BET for SINGLE_BET", () => {
    expect(() => {
      assertValidLimitPeriod("SINGLE_BET", "PER_BET");
    }).not.toThrow();
    expect(() => {
      assertValidLimitPeriod("SINGLE_BET", "DAY");
    }).toThrow(DomainError);
  });
});

describe("effectiveLimitValue", () => {
  it("returns currentValue when there is no pending change", () => {
    expect(effectiveLimitValue(baseLimit(), NOW)).toBe(10_000n);
  });

  it("returns min(current, pending) before effectiveAt", () => {
    const limit = baseLimit({
      pendingValue: 20_000n,
      effectiveAt: new Date(NOW.getTime() + LIMIT_RAISE_COOLING_OFF_MS),
    });
    expect(effectiveLimitValue(limit, NOW)).toBe(10_000n);
  });

  it("returns the pending value once effectiveAt has passed", () => {
    const limit = baseLimit({
      pendingValue: 20_000n,
      effectiveAt: new Date(NOW.getTime() - 1),
    });
    expect(effectiveLimitValue(limit, NOW)).toBe(20_000n);
  });
});

describe("applyLimitChange", () => {
  it("applies a lower value immediately and clears any pending raise", () => {
    const limit = baseLimit({
      pendingValue: 50_000n,
      effectiveAt: new Date(NOW.getTime() + LIMIT_RAISE_COOLING_OFF_MS),
    });
    const result = applyLimitChange(limit, 5_000n, NOW);
    expect(result).toEqual({ currentValue: 5_000n, pendingValue: null, effectiveAt: null });
  });

  it("applies an equal value immediately", () => {
    const result = applyLimitChange(baseLimit(), 10_000n, NOW);
    expect(result).toEqual({ currentValue: 10_000n, pendingValue: null, effectiveAt: null });
  });

  it("defers a raise by the 24h cooling-off period", () => {
    const result = applyLimitChange(baseLimit(), 20_000n, NOW);
    expect(result.currentValue).toBe(10_000n);
    expect(result.pendingValue).toBe(20_000n);
    expect(result.effectiveAt).toEqual(new Date(NOW.getTime() + LIMIT_RAISE_COOLING_OFF_MS));
  });

  it("rejects a negative value", () => {
    expect(() => {
      applyLimitChange(baseLimit(), -1n, NOW);
    }).toThrow(DomainError);
  });

  it("keeps enforcing the lower effective value while a raise is cooling off", () => {
    const change = applyLimitChange(baseLimit(), 20_000n, NOW);
    if (change.effectiveAt === null) {
      expect.unreachable("expected a pending effectiveAt");
      return;
    }
    const effectiveAt = change.effectiveAt;
    const limit = baseLimit({
      currentValue: change.currentValue,
      pendingValue: change.pendingValue,
      effectiveAt,
    });
    const almostThere = new Date(effectiveAt.getTime() - 1);
    expect(effectiveLimitValue(limit, almostThere)).toBe(10_000n);

    expect(effectiveLimitValue(limit, effectiveAt)).toBe(20_000n);
  });
});

describe("selfExclusionRevocableAt", () => {
  it("computes a future date for a timed period", () => {
    expect(selfExclusionRevocableAt("24H", NOW)).toEqual(
      new Date(NOW.getTime() + 24 * 60 * 60 * 1_000),
    );
    expect(selfExclusionRevocableAt("7D", NOW)).toEqual(
      new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1_000),
    );
  });

  it("returns null for PERMANENT", () => {
    expect(selfExclusionRevocableAt("PERMANENT", NOW)).toBeNull();
  });
});
