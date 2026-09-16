import { describe, expect, it } from "vitest";
import { resolveThemeKey, THEME_KEYS } from "./theme";

describe("resolveThemeKey", () => {
  it.each(THEME_KEYS)("resolves a known slug %s to itself", (key) => {
    expect(resolveThemeKey(key)).toBe(key);
  });

  it("falls back to default for an unknown slug", () => {
    expect(resolveThemeKey("some-future-game")).toBe("default");
  });

  it("falls back to default for null/undefined", () => {
    expect(resolveThemeKey(null)).toBe("default");
    expect(resolveThemeKey(undefined)).toBe("default");
  });
});
