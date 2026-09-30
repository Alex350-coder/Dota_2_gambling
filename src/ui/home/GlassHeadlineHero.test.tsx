// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlassHeadlineHero } from "./GlassHeadlineHero";

/**
 * jsdom has no WebGL2, so HTMLCanvasElement.getContext("webgl2") returns null here - exactly
 * the documented fallback path: the engine never starts, `data-glass` stays "false", and the
 * headline shows as solid type over the CSS gradient. That fallback is what's exercised below.
 * jsdom also has no matchMedia, so it's stubbed (the engine reads it eagerly on construction,
 * before it even knows whether WebGL2 is available).
 */
function stubMatchMedia() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe("GlassHeadlineHero", () => {
  beforeEach(() => {
    stubMatchMedia();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a single real <h1> with one selectable span per word", () => {
    render(<GlassHeadlineHero title="Bend the light" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Bend the light");
    expect(heading.querySelectorAll(".ghr-word")).toHaveLength(3);
    expect(heading.querySelectorAll(".ghr-word")[0]).toHaveTextContent("Bend");
  });

  it("renders the eyebrow and description when provided", () => {
    render(
      <GlassHeadlineHero
        title="Bend the light"
        eyebrow="Esports betting"
        description="Every amount here is simulated."
      />,
    );
    expect(screen.getByText("Esports betting")).toBeInTheDocument();
    expect(screen.getByText("Every amount here is simulated.")).toBeInTheDocument();
  });

  it("links the primary and secondary CTAs to their given hrefs", () => {
    render(
      <GlassHeadlineHero
        title="Bend the light"
        primaryAction={{ label: "Explore the Arena", href: "/games" }}
        secondaryAction={{ label: "How it works", href: "/how-it-works" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Explore the Arena" })).toHaveAttribute(
      "href",
      "/games",
    );
    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute(
      "href",
      "/how-it-works",
    );
  });

  it("renders an aria-hidden canvas that never intercepts pointer events", () => {
    const { container } = render(<GlassHeadlineHero title="Bend the light" />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toHaveAttribute("aria-hidden", "true");
  });

  it("stays in the solid-type fallback state when WebGL2 is unavailable", () => {
    const { container } = render(<GlassHeadlineHero title="Bend the light" />);
    const root = container.querySelector(".ghr-root");
    expect(root).toHaveAttribute("data-glass", "false");
  });

  it("unmounts cleanly when the WebGL2 engine never started", () => {
    const { unmount } = render(<GlassHeadlineHero title="Bend the light" />);
    expect(() => {
      unmount();
    }).not.toThrow();
  });
});
