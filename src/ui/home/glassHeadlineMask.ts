/**
 * Rasterizes the real, already-laid-out `.ghr-word` spans of a headline into a 2D-canvas bitmap
 * (T-717): white text on black, at the headline's own font/position, which the WebGL engine then
 * blurs into a bevel height-field. Kept separate from glassHeadlineEngine.ts because it's DOM/2D
 * canvas work, not WebGL state.
 */

export interface TextMaskInput {
  readonly heading: HTMLElement;
  readonly root: HTMLElement;
  readonly scale: number;
}

export interface TextMaskResult {
  readonly canvas: HTMLCanvasElement;
  readonly key: string;
  readonly fontPx: number;
}

function withLetterSpacing(ctx: CanvasRenderingContext2D, value: string): void {
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value;
  }
}

/**
 * Returns null only if the browser can't give us a 2D context - the caller treats that the same
 * as "nothing to build yet" and simply skips this frame's mask update.
 */
export function buildTextMask({ heading, root, scale }: TextMaskInput): TextMaskResult | null {
  const box = root.getBoundingClientRect();
  const width = Math.max(1, Math.round(box.width * scale));
  const height = Math.max(1, Math.round(box.height * scale));
  const spans = Array.from(heading.querySelectorAll<HTMLElement>(".ghr-word"));
  const rects = spans.map((span) => span.getBoundingClientRect());
  const style = getComputedStyle(heading);

  const key = [String(width), String(height), String(scale), style.font, style.letterSpacing]
    .concat(
      spans.map((span, i) => {
        const rect = rects[i];
        const left = rect ? Math.round(rect.left - box.left) : 0;
        const top = rect ? Math.round(rect.top - box.top) : 0;
        return `${span.textContent}@${String(left)},${String(top)}`;
      }),
    )
    .join("|");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  const fontPx = parseFloat(style.fontSize) || 64;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  withLetterSpacing(ctx, style.letterSpacing === "normal" ? "0px" : style.letterSpacing);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  spans.forEach((span, i) => {
    const rect = rects[i];
    if (!rect) return;
    const text = span.textContent;
    const ascent = ctx.measureText(text).fontBoundingBoxAscent || fontPx * 0.8;
    ctx.fillText(text, rect.left - box.left, rect.top - box.top + ascent);
  });

  return { canvas, key, fontPx };
}
