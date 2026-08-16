import { describe, expect, it } from "vitest";
import { isMinor, toMinor, ZERO_MINOR } from "./types";

describe("toMinor", () => {
  it("wraps a non-negative bigint into a Minor value", () => {
    const value = toMinor(1_000n);

    expect(value).toBe(1_000n);
  });

  it("accepts zero", () => {
    expect(toMinor(0n)).toBe(0n);
  });

  it("throws when the value is negative", () => {
    expect(() => toMinor(-1n)).toThrow();
  });

  it("throws when the value is not a bigint", () => {
    expect(() => toMinor(1000 as unknown as bigint)).toThrow();
  });
});

describe("isMinor", () => {
  it("returns true for a non-negative bigint", () => {
    expect(isMinor(5n)).toBe(true);
    expect(isMinor(0n)).toBe(true);
  });

  it("returns false for a negative bigint", () => {
    expect(isMinor(-5n)).toBe(false);
  });

  it("returns false for a non-bigint value", () => {
    expect(isMinor(5)).toBe(false);
    expect(isMinor("5")).toBe(false);
    expect(isMinor(null)).toBe(false);
    expect(isMinor(undefined)).toBe(false);
  });
});

describe("ZERO_MINOR", () => {
  it("is a Minor value equal to zero", () => {
    expect(ZERO_MINOR).toBe(0n);
    expect(isMinor(ZERO_MINOR)).toBe(true);
  });
});
