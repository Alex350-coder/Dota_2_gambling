"use client";

import { useEffect, useState } from "react";
import { DEFAULT_COLORS } from "./glassHeadlineMath";

/**
 * Ground, then four accents - matches glassHeadlineMath's DEFAULT_COLORS slot order. Reusing
 * --state-info/--state-warning for the third/fourth accent avoids inventing new tokens: every
 * theme in theme.css already defines all five (T-717).
 */
const TOKEN_VARS = [
  "--surface-0",
  "--accent-primary",
  "--accent-secondary",
  "--state-info",
  "--state-warning",
] as const;

/**
 * Reads the hero's live theme colors as hex strings on mount, so the WebGL shader (which needs
 * real #rrggbb floats, not CSS var() refs) still adapts if this hero is ever reused under a
 * different `data-theme`. Falls back to DEFAULT_COLORS until the ref is attached.
 */
export function useThemeHexColors(elementRef: React.RefObject<HTMLElement | null>): string[] {
  const [colors, setColors] = useState<string[]>(() => [...DEFAULT_COLORS]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const style = getComputedStyle(element);
    const next = TOKEN_VARS.map((token, i) => {
      const value = style.getPropertyValue(token).trim();
      return value === "" ? (DEFAULT_COLORS[i] ?? "#000000") : value;
    });
    setColors(next);
  }, [elementRef]);

  return colors;
}
