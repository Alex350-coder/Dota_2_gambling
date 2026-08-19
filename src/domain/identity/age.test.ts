import { describe, expect, it } from "vitest";
import { isAdult } from "./age";

describe("isAdult", () => {
  it("returns true for someone who turned 18 exactly today", () => {
    expect(isAdult("2008-08-19", new Date("2026-08-19T00:00:00Z"))).toBe(true);
  });

  it("returns false for someone who turns 18 tomorrow", () => {
    expect(isAdult("2008-08-20", new Date("2026-08-19T00:00:00Z"))).toBe(false);
  });

  it("returns true for a well-established adult", () => {
    expect(isAdult("1990-01-01", new Date("2026-08-19T00:00:00Z"))).toBe(true);
  });

  it("returns false for an invalid date string", () => {
    expect(isAdult("not-a-date", new Date("2026-08-19T00:00:00Z"))).toBe(false);
  });
});
