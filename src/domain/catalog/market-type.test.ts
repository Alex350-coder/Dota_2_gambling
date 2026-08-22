import { describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import { assertSupportedByEconomicModel, MATCH_WINNER } from "./market-type";

describe("assertSupportedByEconomicModel", () => {
  it("accepts the built-in binary MATCH_WINNER type", () => {
    expect(() => {
      assertSupportedByEconomicModel(MATCH_WINNER);
    }).not.toThrow();
  });

  it("rejects a non-binary market type with UNSUPPORTED_MARKET_MODEL", () => {
    const nAryType = {
      code: "TOP_FRAGGER",
      name: "Top Fragger",
      outcomeCardinality: "N_ARY",
    } as const;

    expect(() => {
      assertSupportedByEconomicModel(nAryType);
    }).toThrow(DomainError);
    try {
      assertSupportedByEconomicModel(nAryType);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("UNSUPPORTED_MARKET_MODEL");
    }
  });
});
