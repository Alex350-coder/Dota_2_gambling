// @vitest-environment jsdom
import { createRef } from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_COLORS } from "./glassHeadlineMath";
import { useThemeHexColors } from "./useThemeHexColors";

describe("useThemeHexColors", () => {
  it("returns the default palette while the ref is unattached", () => {
    const ref = createRef<HTMLElement | null>();
    const { result } = renderHook(() => useThemeHexColors(ref));
    expect(result.current).toEqual(DEFAULT_COLORS);
  });

  it("reads real theme token values from the attached element's computed style", () => {
    const element = document.createElement("div");
    element.style.setProperty("--surface-0", "#111111");
    document.body.appendChild(element);
    const ref = { current: element };

    const { result } = renderHook(() => useThemeHexColors(ref));

    expect(result.current[0]).toBe("#111111");
    // Tokens with no value set on the element fall back to DEFAULT_COLORS in that slot.
    expect(result.current[1]).toBe(DEFAULT_COLORS[1]);

    document.body.removeChild(element);
  });
});
