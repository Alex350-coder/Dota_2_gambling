"use client";

import { useEffect, useRef } from "react";
import { HeroNetworkAnimation } from "./heroNetworkAnimation";

/**
 * Decorative canvas layer (T-717) — never load-bearing; all real content lives in
 * Hero.tsx's DOM. `aria-hidden` and `pointer-events-none` so it stays invisible to
 * assistive tech and never intercepts clicks on the CTAs above it.
 */
export function HeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext("2d") ?? null;
    if (!canvas || !ctx || !parent) return;
    const parentElement: HTMLElement = parent;

    const animation = new HeroNetworkAnimation({ canvas, context: ctx });

    function resize() {
      const rect = parentElement.getBoundingClientRect();
      animation.resize(rect.width, rect.height);
    }

    resize();
    window.addEventListener("resize", resize);
    animation.start();

    return () => {
      window.removeEventListener("resize", resize);
      animation.stop();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
