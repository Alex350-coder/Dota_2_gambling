/** Fallback field palette (ground, then four accents) used only when theme colors are unavailable. */
export const DEFAULT_COLORS = ["#0D0A14", "#FF5A1F", "#FF9EC1", "#2F4CFF", "#FFE6B8"];

export function hexToRgb(hex: string): number[] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const digits = match?.[1];
  if (!digits) return null;
  const value = parseInt(digits, 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Five colours as flat RGB triples; anything missing or malformed falls back to the default in that slot. */
export function paletteOf(colors: string[] | undefined): number[][] {
  return DEFAULT_COLORS.map(
    (fallback, i) => hexToRgb(colors?.[i] ?? "") ?? hexToRgb(fallback) ?? [0, 0, 0],
  );
}

export function splitWords(title: string): string[] {
  return title.trim().split(/\s+/).filter(Boolean);
}

/** Width of the glass bevel, in mask pixels: a share of the type size, never under 2px. */
export function bevelPx(fontPx: number, scale: number): number {
  return Math.max(2, fontPx * 0.075 * scale);
}

/** How far the glass has formed, t ms after it is ready: an ease-out from clear to full glass. */
export function formed(t: number, ms: number): number {
  const x = Math.min(Math.max(t / ms, 0), 1);
  return 1 - Math.pow(1 - x, 3);
}

/**
 * The same palette as a plain CSS background: what shows before the glass fades in, and instead
 * of it without WebGL2. rgba() throughout, because one malformed colour drops the whole
 * declaration and leaves white behind white type.
 */
export function fallbackBackground(palette: number[][]): string {
  const at = (c: number[] | undefined, i: number, fallback: number): number => c?.[i] ?? fallback;
  const rgba = (c: number[] | undefined, a: number): string => {
    const r = String(Math.round(at(c, 0, 0) * 255));
    const g = String(Math.round(at(c, 1, 0) * 255));
    const b = String(Math.round(at(c, 2, 0) * 255));
    return `rgba(${r},${g},${b},${String(a)})`;
  };
  return (
    `radial-gradient(60% 50% at 25% 30%,${rgba(palette[1], 0.4)},transparent 70%),` +
    `radial-gradient(50% 45% at 78% 35%,${rgba(palette[3], 0.4)},transparent 70%),` +
    `radial-gradient(45% 40% at 60% 80%,${rgba(palette[2], 0.27)},transparent 70%),` +
    rgba(palette[0], 1)
  );
}

/** Frame-rate-independent approach of `from` toward `to`. */
export function follow(from: number, to: number, dt: number, rate: number): number {
  return to + (from - to) * Math.exp(-rate * dt);
}

/** Where the light drifts when nobody is pointing: a slow Lissajous over the headline. */
export function orbit(t: number): number[] {
  return [0.5 + 0.32 * Math.sin(t * 0.37), 0.56 + 0.16 * Math.sin(t * 0.53 + 1.1)];
}
