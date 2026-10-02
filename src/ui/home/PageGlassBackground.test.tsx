// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

/**
 * jsdom has no WebGL2, so the engine never starts here - these cover the structural/fallback
 * contract: the background renders fixed and aria-hidden, never throws, and cleans up on
 * unmount. jsdom also has no matchMedia; stubbed for the same reason as the old hero tests (the
 * engine/pointer-parallax setup reads it eagerly).
 */
function stubMatchMedia(matches = false) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe("PageGlassBackground", () => {
  beforeEach(() => {
    stubMatchMedia();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.glass;
  });

  it("renders an aria-hidden, non-interactive fixed layer with its own canvas", async () => {
    const { PageGlassBackground } = await import("./PageGlassBackground");
    const { container } = render(<PageGlassBackground />);
    const root = container.querySelector(".ghr-bg-root");
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root?.querySelector("canvas")).not.toBeNull();
  });

  it("never sets html[data-glass] when WebGL2 is unavailable", async () => {
    const { PageGlassBackground } = await import("./PageGlassBackground");
    render(<PageGlassBackground />);
    expect(document.documentElement.dataset.glass).toBeUndefined();
  });

  it("unmounts cleanly when the WebGL2 engine never started", async () => {
    const { PageGlassBackground } = await import("./PageGlassBackground");
    const { unmount } = render(<PageGlassBackground />);
    expect(() => {
      unmount();
    }).not.toThrow();
  });

  it("tracks pointermove on a fine pointer and stops on unmount, without throwing", async () => {
    stubMatchMedia(true);
    const { PageGlassBackground } = await import("./PageGlassBackground");
    const { unmount } = render(<PageGlassBackground />);

    expect(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 10, clientY: 10 }));
    }).not.toThrow();

    unmount();
    expect(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 20, clientY: 20 }));
    }).not.toThrow();
  });
});
