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
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    function resize() {
      const rect = parentElement.getBoundingClientRect();
      animation.resize(rect.width, rect.height);
      if (reducedMotion) {
        animation.renderStaticFrame();
      }
    }

    function handlePointerMove(event: PointerEvent) {
      animation.setPointerTarget(
        event.clientX / window.innerWidth,
        event.clientY / window.innerHeight,
      );
    }

    resize();
    window.addEventListener("resize", resize);
    if (!reducedMotion) {
      animation.start();
      // Real cursors only - never simulate one from touch input on coarse pointers.
      if (finePointer) {
        window.addEventListener("pointermove", handlePointerMove);
      }
    }

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
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
