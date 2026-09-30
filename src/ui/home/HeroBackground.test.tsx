// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeroBackground } from "./HeroBackground";

function mockMatchMedia(matches: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function fakeCanvasContext() {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
  };
}

describe("HeroBackground", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders an aria-hidden, non-interactive canvas", () => {
    const { container } = render(<HeroBackground />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas).toHaveClass("pointer-events-none");
  });

  it("never starts requestAnimationFrame under prefers-reduced-motion", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      fakeCanvasContext() as unknown as RenderingContext,
    );
    vi.stubGlobal("matchMedia", mockMatchMedia(true));
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");

    render(<HeroBackground />);

    expect(rafSpy).not.toHaveBeenCalled();
  });

  it("starts and cleanly cancels the animation frame on unmount", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      fakeCanvasContext() as unknown as RenderingContext,
    );
    vi.stubGlobal("matchMedia", mockMatchMedia(false));
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    const cafSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const removeListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<HeroBackground />);
    expect(rafSpy).toHaveBeenCalled();

    expect(() => {
      unmount();
    }).not.toThrow();
    expect(cafSpy).toHaveBeenCalled();
    expect(removeListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function) as () => void);
  });
});
