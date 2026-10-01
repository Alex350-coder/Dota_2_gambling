// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GlassHeadlineHero } from "./GlassHeadlineHero";

/**
 * GlassHeadlineHero is pure content (T-717 follow-up) — no canvas, no WebGL, no client-side
 * state. The actual glass effect is painted by a separate page-wide background
 * (PageGlassBackground) that finds this component's <h1> via `data-glass-title`; these tests
 * only cover the content itself.
 */
describe("GlassHeadlineHero", () => {
  it("renders a single real <h1> with one selectable span per word, tagged for the background", () => {
    render(<GlassHeadlineHero title="Bend the light" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Bend the light");
    expect(heading).toHaveAttribute("data-glass-title");
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

  it("renders an action with no href as a real button, not a link", () => {
    const onClick = () => undefined;
    render(
      <GlassHeadlineHero title="Bend the light" primaryAction={{ label: "Open modal", onClick }} />,
    );
    const button = screen.getByRole("button", { name: "Open modal" });
    expect(button).toHaveAttribute("type", "button");
  });

  it("renders extra children below the CTAs", () => {
    render(
      <GlassHeadlineHero title="Bend the light">
        <p>Extra content</p>
      </GlassHeadlineHero>,
    );
    expect(screen.getByText("Extra content")).toBeInTheDocument();
  });
});
