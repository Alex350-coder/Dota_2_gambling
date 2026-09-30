import { describe, expect, it } from "vitest";
import {
  bevelPx,
  DEFAULT_COLORS,
  fallbackBackground,
  follow,
  formed,
  hexToRgb,
  orbit,
  paletteOf,
  splitWords,
} from "./glassHeadlineMath";

describe("hexToRgb", () => {
  it("parses a 6-digit hex color into 0..1 RGB floats", () => {
    expect(hexToRgb("#ff0000")).toEqual([1, 0, 0]);
    expect(hexToRgb("#00ff00")).toEqual([0, 1, 0]);
    expect(hexToRgb("#0000ff")).toEqual([0, 0, 1]);
  });

  it("accepts hex without a leading #", () => {
    expect(hexToRgb("ffffff")).toEqual([1, 1, 1]);
  });

  it("returns null for malformed input", () => {
    expect(hexToRgb("not-a-color")).toBeNull();
    expect(hexToRgb("#fff")).toBeNull();
    expect(hexToRgb("")).toBeNull();
  });
});

describe("paletteOf", () => {
  it("uses provided colors in order", () => {
    const palette = paletteOf(["#ffffff", "#000000", "#ff0000", "#00ff00", "#0000ff"]);
    expect(palette[0]).toEqual([1, 1, 1]);
    expect(palette[1]).toEqual([0, 0, 0]);
  });

  it("falls back to DEFAULT_COLORS for missing or malformed slots", () => {
    const palette = paletteOf(["#ffffff", "bad-color"]);
    expect(palette[0]).toEqual([1, 1, 1]);
    expect(palette[1]).toEqual(hexToRgb(DEFAULT_COLORS[1] ?? ""));
    expect(palette[4]).toEqual(hexToRgb(DEFAULT_COLORS[4] ?? ""));
  });

  it("falls back cleanly when colors is undefined", () => {
    const palette = paletteOf(undefined);
    expect(palette).toHaveLength(5);
    expect(palette.every((c) => c.length === 3)).toBe(true);
  });
});

describe("splitWords", () => {
  it("splits on whitespace and drops empties", () => {
    expect(splitWords("  Bend   the  light  ")).toEqual(["Bend", "the", "light"]);
  });

  it("returns an empty array for blank input", () => {
    expect(splitWords("   ")).toEqual([]);
  });
});

describe("bevelPx", () => {
  it("scales with font size and never drops below 2px", () => {
    expect(bevelPx(80, 1)).toBeCloseTo(6);
    expect(bevelPx(1, 1)).toBe(2);
  });
});

describe("formed", () => {
  it("is 0 at t=0 and 1 once fully elapsed", () => {
    expect(formed(0, 1000)).toBe(0);
    expect(formed(1000, 1000)).toBe(1);
  });

  it("clamps outside the 0..ms range", () => {
    expect(formed(-500, 1000)).toBe(0);
    expect(formed(5000, 1000)).toBe(1);
  });
});

describe("fallbackBackground", () => {
  it("produces a CSS background-image value with four layers", () => {
    const css = fallbackBackground(paletteOf(undefined));
    expect(css.match(/radial-gradient/g)).toHaveLength(3);
    expect(css).toMatch(/rgba\(\d+,\d+,\d+,1\)$/);
  });
});

describe("follow", () => {
  it("moves toward the target without overshooting", () => {
    const next = follow(0, 1, 0.1, 5);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });

  it("converges to the target as dt grows", () => {
    expect(follow(0, 1, 100, 5)).toBeCloseTo(1, 5);
  });
});

describe("orbit", () => {
  it("stays within the Lissajous bounds", () => {
    for (let t = 0; t < 20; t += 0.7) {
      const [x, y] = orbit(t);
      expect(x).toBeGreaterThanOrEqual(0.18);
      expect(x).toBeLessThanOrEqual(0.82);
      expect(y).toBeGreaterThanOrEqual(0.4);
      expect(y).toBeLessThanOrEqual(0.72);
    }
  });
});
