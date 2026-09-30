"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { fallbackBackground, paletteOf, splitWords } from "./glassHeadlineMath";
import { GlassHeadlineEngine } from "./glassHeadlineEngine";
import { CSS } from "./glassHeadlineShaders";
import { useThemeHexColors } from "./useThemeHexColors";

interface HeroAction {
  readonly label: string;
  readonly href?: string;
  readonly onClick?: () => void;
}

export interface GlassHeadlineHeroProps {
  readonly title: string;
  readonly eyebrow?: string;
  readonly description?: string;
  readonly primaryAction?: HeroAction;
  readonly secondaryAction?: HeroAction;
  /** Five #rrggbb colors (ground, then four accents). Defaults to the live theme tokens. */
  readonly colors?: string[];
  /** Must be a definite CSS length. */
  readonly height?: string;
  readonly className?: string;
  /** Per-request CSP nonce for the injected <style> tag (see Hero.tsx and middleware.ts). */
  readonly nonce?: string | undefined;
}

function ActionArrow() {
  return (
    <svg
      className="ghr-arrow"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Action({ action, kind }: { action: HeroAction; kind: "primary" | "secondary" }) {
  const className = `ghr-btn ghr-${kind}`;
  const content = (
    <>
      {action.label}
      {kind === "primary" ? <ActionArrow /> : null}
    </>
  );
  if (action.href) {
    return (
      <a className={className} href={action.href} onClick={action.onClick}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" className={className} onClick={action.onClick}>
      {content}
    </button>
  );
}

/**
 * Glass Headline Hero (T-717) — a hero whose headline is refractive glass, with a flowing color
 * field behind it that bends through the letters. The headline stays a real <h1> (every word a
 * real <span>, laid out by the browser); the glass is WebGL2 paint over it, never a replacement
 * for the text. Falls back to solid type over a CSS gradient without WebGL2 or under
 * prefers-reduced-motion.
 */
export function GlassHeadlineHero({
  title,
  eyebrow,
  description,
  primaryAction,
  secondaryAction,
  colors,
  height = "100svh",
  className = "",
  nonce,
}: GlassHeadlineHeroProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const engineRef = useRef<GlassHeadlineEngine | null>(null);
  const [glass, setGlass] = useState(false);
  const [generation, setGeneration] = useState(0);

  const themeColors = useThemeHexColors(rootRef);
  const activeColors = colors ?? themeColors;
  const palette = paletteOf(activeColors);
  const words = splitWords(title);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;

    const engine = new GlassHeadlineEngine({
      canvas,
      root,
      getTitleElement: () => titleRef.current,
      initialPalette: paletteOf(activeColors),
      onReady: () => {
        setGlass(true);
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
      setGlass(false);
    };
    // activeColors is intentionally not a dependency: color updates are pushed via setPalette()
    // below rather than restarting the WebGL context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation]);

  useEffect(() => {
    engineRef.current?.setPalette(paletteOf(activeColors));
  }, [activeColors]);

  useEffect(() => {
    engineRef.current?.rebuildMask();
  }, [title]);

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1 - (event.clientY - rect.top) / rect.height;
    engineRef.current?.handlePointer(x, y);
  }

  return (
    <section
      ref={rootRef}
      className={`ghr-root ${className}`}
      style={{ height, background: fallbackBackground(palette) }}
      data-glass={glass}
      onPointerMove={handlePointerMove}
    >
      <style nonce={nonce}>{CSS}</style>
      <canvas ref={canvasRef} className="ghr-canvas" aria-hidden="true" />
      <div className="ghr-content">
        {eyebrow ? <span className="ghr-eyebrow">{eyebrow}</span> : null}
        <h1 ref={titleRef} className="ghr-title">
          {words.map((word, i) => (
            <Fragment key={word + String(i)}>
              <span className="ghr-word">{word}</span>
              {i < words.length - 1 ? " " : null}
            </Fragment>
          ))}
        </h1>
        {description ? <p className="ghr-desc">{description}</p> : null}
        {primaryAction || secondaryAction ? (
          <div className="ghr-actions">
            {primaryAction ? <Action action={primaryAction} kind="primary" /> : null}
            {secondaryAction ? <Action action={secondaryAction} kind="secondary" /> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
