// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hero } from "./Hero";

// jsdom has no matchMedia; GlassHeadlineHero's engine reads it on construction.
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

describe("Hero", () => {
  beforeEach(() => {
    stubMatchMedia();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a single top-level heading", () => {
    render(<Hero />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("links the primary CTA to the games route", () => {
    render(<Hero />);
    expect(screen.getByRole("link", { name: "Explore the Arena" })).toHaveAttribute(
      "href",
      "/games",
    );
  });

  it("links the secondary CTA to how-it-works", () => {
    render(<Hero />);
    const links = screen.getAllByRole("link", { name: "How it works" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/how-it-works");
    }
  });

  it("never claims real money is at stake", () => {
    render(<Hero />);
    expect(screen.getByText(/simulated/i)).toBeInTheDocument();
  });
});
