"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { fallbackBackground, paletteOf } from "./glassHeadlineMath";
import { GlassHeadlineEngine } from "./glassHeadlineEngine";
import { CSS } from "./glassHeadlineShaders";
import { useThemeHexColors } from "./useThemeHexColors";

/**
 * Any page's hero headline tags its real `<h1>` with a `data-glass-title` attribute (see
 * GlassHeadlineHero.tsx) so this background can find it.
 */
const GLASS_TITLE_SELECTOR = "[data-glass-title]";

export interface PageGlassBackgroundProps {
  /** Per-request CSP nonce for the injected <style> tag (see PublicLayout and middleware.ts). */
  readonly nonce?: string | undefined;
}

function queryTitleElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>(GLASS_TITLE_SELECTOR);
}

/**
 * The flowing color field + glass-letter refraction as a true page background (T-717 follow-up):
 * fixed behind the nav bar, page content and footer on every public page, rather than confined
 * to the hero's own box. Mounted once in PublicLayout so it persists across client-side
 * navigation instead of remounting (and restarting its WebGL context) on every route change.
 *
 * It finds the current page's glass headline itself (GLASS_TITLE_SELECTOR) rather than taking
 * it as a prop, since it's rendered far above any page-specific content in the tree. Pages with
 * no tagged headline (every route except the homepage today) just show the flowing field with
 * nothing masked onto it. The glass/no-glass state is mirrored onto <html data-glass> so
 * GlassHeadlineHero's CSS (a separate subtree) can react to it - see glassHeadlineShaders.ts.
 */
export function PageGlassBackground({ nonce }: PageGlassBackgroundProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GlassHeadlineEngine | null>(null);
  const [generation, setGeneration] = useState(0);
  const pathname = usePathname();

  const themeColors = useThemeHexColors(rootRef);
  const palette = paletteOf(themeColors);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;

    const engine = new GlassHeadlineEngine({
      canvas,
      root,
      getTitleElement: queryTitleElement,
      initialPalette: paletteOf(themeColors),
      onReady: () => {
        document.documentElement.dataset.glass = "true";
      },
      onContextRestored: () => {
        setGeneration((g) => g + 1);
      },
    });
    engineRef.current = engine;
    engine.start();

    return () => {
      engine.dispose();
      engineRef.current = null;
      delete document.documentElement.dataset.glass;
    };
    // themeColors is intentionally not a dependency: color updates are pushed via setPalette()
    // below rather than restarting the WebGL context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation]);

  useEffect(() => {
    engineRef.current?.setPalette(paletteOf(themeColors));
  }, [themeColors]);

  useEffect(() => {
    // The headline that should be masked changes with the route (only the homepage has one
    // today); the engine's own frame loop keeps re-checking it too, but this makes the swap
    // instant on navigation rather than waiting for the next detected layout change.
    engineRef.current?.rebuildMask();
  }, [pathname]);

  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    if (!finePointer) return;
    function handlePointerMove(event: PointerEvent) {
      engineRef.current?.handlePointer(
        event.clientX / window.innerWidth,
        1 - event.clientY / window.innerHeight,
      );
    }
    window.addEventListener("pointermove", handlePointerMove);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="ghr-bg-root"
      style={{ background: fallbackBackground(palette) }}
      aria-hidden="true"
    >
      <style nonce={nonce}>{CSS}</style>
      <canvas ref={canvasRef} className="ghr-bg-canvas" />
    </div>
  );
}
